import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Countdown,
  ServerClockProvider,
  announcementKey,
  computeRemainingMs,
  countdownParts,
  describeRemaining,
  estimateClockOffset,
  offsetFromDateHeader,
  offsetFromSample,
  useCountdown,
} from '../src';

const NOW = Date.parse('2026-10-14T20:00:00.000Z');
const S = 1000;
const M = 60 * S;
const H = 60 * M;

describe('server clock maths', () => {
  it('computes remaining time on the SERVER clock', () => {
    const target = '2026-10-14T20:00:10.000Z';
    // device clock is 5 s behind the server: the server already read 20:00:05 when the device read 20:00:00
    expect(computeRemainingMs(target, 5 * S, NOW)).toBe(5 * S);
    // device clock 5 s ahead of the server
    expect(computeRemainingMs(target, -5 * S, NOW)).toBe(15 * S);
    expect(computeRemainingMs(target, 0, NOW)).toBe(10 * S);
  });

  it('never goes negative and survives bad targets', () => {
    expect(computeRemainingMs('2020-01-01T00:00:00Z', 0, NOW)).toBe(0);
    expect(computeRemainingMs('garbage', 0, NOW)).toBe(0);
    expect(computeRemainingMs(NOW + 1000, 0, NOW)).toBe(1000);
    expect(computeRemainingMs(new Date(NOW + 2000), 0, NOW)).toBe(2000);
  });

  it('splits into days, hours, minutes, seconds with seconds rounded up', () => {
    expect(countdownParts(2 * 86_400_000 + 4 * H + 12 * M + 9 * S)).toEqual({
      days: 2,
      hours: 4,
      minutes: 12,
      seconds: 9,
      totalSeconds: 2 * 86_400 + 4 * 3600 + 12 * 60 + 9,
    });
    expect(countdownParts(400).seconds).toBe(1);
    expect(countdownParts(0).totalSeconds).toBe(0);
    expect(countdownParts(-1).totalSeconds).toBe(0);
  });

  it('turns a health sample into an offset using half the round trip', () => {
    // request left at device 9_000; server stamped 10_000 about 100 ms later (rtt 200)
    expect(offsetFromSample({ serverTime: 10_000, sentAt: 9_000, rttMs: 200 })).toBe(900);
    expect(offsetFromSample({ serverTime: new Date(10_000).toISOString(), sentAt: 9_000, rttMs: 0 })).toBe(1000);
    // symmetric check: at arrival the device read 9_200, the server read 10_100
    expect(10_100 - 9_200).toBe(900);
  });

  it('picks the sample with the smallest RTT and ignores very slow ones', () => {
    const best = estimateClockOffset([
      { serverTime: 10_000, sentAt: 9_000, rttMs: 900 },
      { serverTime: 20_000, sentAt: 19_050, rttMs: 100 },
      { serverTime: 30_000, sentAt: 29_999, rttMs: 4000 },
    ]);
    expect(best.rttMs).toBe(100);
    expect(best.offsetMs).toBe(20_000 - 19_050 - 50);
    expect(best.uncertain).toBe(false);
  });

  it('falls back to a slow sample when nothing better exists, and flags no samples', () => {
    expect(estimateClockOffset([{ serverTime: 10_000, sentAt: 5_000, rttMs: 5000 }]).uncertain).toBe(false);
    expect(estimateClockOffset([])).toEqual({ offsetMs: 0, uncertain: true, rttMs: null });
    expect(estimateClockOffset([{ serverTime: 'nope', sentAt: 1, rttMs: 1 }]).uncertain).toBe(true);
  });

  it('derives an offset from the Date header (second precision) as a fallback', () => {
    const received = Date.parse('2026-10-14T20:00:00.400Z');
    expect(offsetFromDateHeader('Wed, 14 Oct 2026 20:00:03 GMT', received)).toBe(Date.parse('2026-10-14T20:00:03.500Z') - received);
    expect(offsetFromDateHeader('not a date', received)).toBeNull();
  });
});

describe('announcement rules', () => {
  it('changes key once a minute, then every 10 seconds in the final minute', () => {
    // minutes are rounded up: 4:59 still reads "5 minutes"
    expect(announcementKey(5 * M)).toBe(announcementKey(4 * M + 59 * S));
    expect(announcementKey(5 * M + 30 * S)).not.toBe(announcementKey(5 * M)); // 6 min vs 5 min
    expect(announcementKey(4 * M)).not.toBe(announcementKey(4 * M + 1 * S));
    expect(announcementKey(2 * M)).toBe(announcementKey(1 * M + 1 * S));
    // last minute: ten-second buckets (60..51, 50..41, ...)
    expect(announcementKey(60 * S)).toBe(announcementKey(55 * S));
    expect(announcementKey(51 * S)).not.toBe(announcementKey(50 * S));
    expect(announcementKey(45 * S)).toBe(announcementKey(41 * S));
    expect(announcementKey(41 * S)).not.toBe(announcementKey(40 * S));
  });

  it('describes the remaining time in words', () => {
    expect(describeRemaining(2 * 86_400_000 + 4 * H + 12 * M)).toBe('2 days, 4 hours, 12 minutes remaining');
    expect(describeRemaining(1 * H + 1 * M)).toBe('1 hour, 1 minute remaining');
    expect(describeRemaining(5 * M)).toBe('5 minutes remaining');
    expect(describeRemaining(30 * S)).toBe('30 seconds remaining');
    expect(describeRemaining(1 * S)).toBe('1 second remaining');
  });
});

describe('useCountdown and <Countdown>', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks once per second on the offset server clock', () => {
    const target = '2026-10-14T20:00:10.000Z';
    const { result } = renderHook(() => useCountdown(target, 5 * S));
    expect(result.current.text).toBe('00:05');
    expect(result.current.done).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1001);
    });
    expect(result.current.text).toBe('00:04');
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.done).toBe(true);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.text).toBe('00:00');
  });

  it('takes the offset from <ServerClockProvider> and lets an argument override it', () => {
    const target = '2026-10-14T20:01:00.000Z';
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ServerClockProvider offsetMs={10 * S}>{children}</ServerClockProvider>
    );
    const { result } = renderHook(() => useCountdown(target), { wrapper });
    expect(result.current.text).toBe('00:50');
    expect(result.current.uncertain).toBe(false);
    const { result: overridden } = renderHook(() => useCountdown(target, 0), { wrapper });
    expect(overridden.current.text).toBe('01:00');
  });

  it('flags an uncertain clock when no provider supplies an offset', () => {
    const { result } = renderHook(() => useCountdown('2026-10-14T20:01:00.000Z'));
    expect(result.current.uncertain).toBe(true);
  });

  it('does not tick while paused', () => {
    const { result } = renderHook(() => useCountdown('2026-10-14T20:01:00.000Z', 0, { paused: true }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.text).toBe('01:00');
  });

  it('re-syncs when the tab becomes visible again', () => {
    const { result } = renderHook(() => useCountdown('2026-10-14T20:01:00.000Z', 0));
    vi.setSystemTime(NOW + 30 * S); // a throttled background tab missed its ticks
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.text).toBe('00:30');
  });

  it('renders static time first, then a timer with role=timer and aria-live=off', () => {
    render(<Countdown target="2026-10-14T21:00:00.000Z" label="Drop 03 starts in" staticText="14 Oct, 21:00" variant="inline" />);
    const timer = screen.getByRole('timer', { name: 'Drop 03 starts in' });
    expect(timer).toHaveAttribute('aria-live', 'off');
    expect(timer).toHaveTextContent('01:00:00');
    expect(timer.querySelector('time')).toHaveAttribute('datetime', '2026-10-14T21:00:00.000Z');
  });

  it('announces politely once a minute, not every second', () => {
    render(<Countdown target="2026-10-14T20:03:30.000Z" label="Starts in" variant="inline" />);
    const announcer = screen.getByTestId('countdown-announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer).toHaveTextContent('');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(announcer).toHaveTextContent(''); // still inside the first minute bucket
    act(() => {
      vi.advanceTimersByTime(28_100); // 3:00 left: a new minute
    });
    expect(announcer).toHaveTextContent('3 minutes remaining');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(announcer).toHaveTextContent('3 minutes remaining');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(announcer).toHaveTextContent('2 minutes remaining');
  });

  it('shows "Going live..." at zero, calls onComplete exactly once, and never says live itself', () => {
    const onComplete = vi.fn();
    render(<Countdown target="2026-10-14T20:00:02.000Z" label="Starts in" onComplete={onComplete} variant="strip" />);
    expect(screen.queryByText('Going live...')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Going live...')).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Live now')).toBeNull();
  });

  it('shows parent-decided states instead of counting', () => {
    const { rerender } = render(<Countdown target="2026-10-14T21:00:00.000Z" label="x" status="live" />);
    expect(screen.getByText('Live now')).toBeInTheDocument();
    rerender(<Countdown target="2026-10-14T21:00:00.000Z" label="x" status="ended" />);
    expect(screen.getByText('Ended')).toBeInTheDocument();
  });

  it('large and strip variants show unit labels and drop the days block when zero', () => {
    const { rerender } = render(<Countdown target="2026-10-16T20:00:00.000Z" label="Starts in" variant="large" />);
    expect(screen.getByText('Days')).toBeInTheDocument();
    rerender(<Countdown target="2026-10-14T21:00:00.000Z" label="Starts in" variant="large" />);
    expect(screen.queryByText('Days')).toBeNull();
    expect(screen.getByText('Hours')).toBeInTheDocument();
  });

  it('uses the accent as the strip colour with black text', () => {
    const { container } = render(<Countdown target="2026-10-14T21:00:00.000Z" label="x" variant="strip" accent="SKY" />);
    expect((container.firstChild as HTMLElement).className).toContain('bg-sky');
    expect((container.firstChild as HTMLElement).className).toContain('text-ink');
    const plain = render(<Countdown target="2026-10-14T21:00:00.000Z" label="x" variant="strip" />);
    expect((plain.container.firstChild as HTMLElement).className).toContain('bg-ink');
    expect((plain.container.firstChild as HTMLElement).className).toContain('text-white');
  });

  it('unmount clears timers', () => {
    const { unmount } = render(<Countdown target="2026-10-14T21:00:00.000Z" label="x" />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// keep fireEvent import used for focus handlers in future tests
void fireEvent;

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Accordion,
  AnnouncementBar,
  Avatar,
  Badge,
  Banner,
  Button,
  CopyButton,
  EmptyState,
  ErrorState,
  FloatingWhatsApp,
  Logo,
  LOGO_MIN_WIDTH,
  Media,
  PackCard,
  PriceTag,
  ProgressBar,
  ProductCard,
  RichText,
  Section,
  Skeleton,
  SkipLink,
  StatCard,
  STATUS_META,
  StatusPill,
  StatusTimeline,
  StimpieCard,
  TextLink,
  ToastProvider,
  TrustStrip,
  UIProvider,
  WhatsAppButton,
  badgeCopy,
  useSkeletonDelay,
  useToast,
  type OrderStatus,
  type StimpieLike,
} from '../src';
import { renderHook } from '@testing-library/react';

const ALL: OrderStatus[] = ['NEW', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED'];

describe('StatusPill (design-system 2.3 mapping)', () => {
  const expected: Record<OrderStatus, { label: string; bg: string; text: string }> = {
    NEW: { label: 'New', bg: 'bg-coral', text: 'text-ink' },
    CONFIRMED: { label: 'Confirmed', bg: 'bg-action', text: 'text-white' },
    PACKED: { label: 'Packed', bg: 'bg-butter', text: 'text-ink' },
    OUT_FOR_DELIVERY: { label: 'Out for delivery', bg: 'bg-sky', text: 'text-ink' },
    DELIVERED: { label: 'Delivered', bg: 'bg-success', text: 'text-white' },
    CANCELLED: { label: 'Cancelled', bg: 'bg-neutral', text: 'text-white' },
    RETURNED: { label: 'Returned', bg: 'bg-danger', text: 'text-white' },
  };

  it('covers exactly the 7 OrderStatus values', () => {
    expect(Object.keys(STATUS_META).sort()).toEqual([...ALL].sort());
  });

  it.each(ALL)('%s renders label, icon and the right colour pair', (status) => {
    const { container } = render(<StatusPill status={status} />);
    const pill = container.firstElementChild as HTMLElement;
    const e = expected[status];
    expect(pill).toHaveTextContent(e.label);
    expect(pill.className).toContain(e.bg);
    expect(pill.className).toContain(e.text);
    const icon = pill.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true'); // decorative: the label carries the meaning
    expect(pill).toHaveAttribute('data-status', status);
  });

  it('uses a different icon for every status', () => {
    const shapes = new Set(ALL.map((s) => render(<StatusPill status={s} />).container.querySelector('svg')?.innerHTML));
    expect(shapes.size).toBe(7);
  });

  it('never pairs white text with coral, butter or sky', () => {
    for (const s of ALL) {
      const cls = expected[s].bg + ' ' + expected[s].text;
      if (/bg-(coral|butter|sky)/.test(cls)) expect(cls).toContain('text-ink');
    }
  });
});

describe('Badge copy', () => {
  it('maps kinds to the website-pages copy', () => {
    expect(badgeCopy('CORE')).toBe('Core');
    expect(badgeCopy('LIMITED')).toBe('Limited');
    expect(badgeCopy('LOW')).toBe('Last few');
    expect(badgeCopy('LOW', undefined, 3)).toBe('Last few · 3 left');
    expect(badgeCopy('LOW', undefined, null)).toBe('Last few');
    expect(badgeCopy('SOLD_OUT')).toBe('Sold out');
    expect(badgeCopy('UPCOMING')).toBe('Coming soon');
    expect(badgeCopy('ENDED')).toBe("Won't return");
    expect(badgeCopy('POPULAR')).toBe('Most popular');
    expect(badgeCopy('POPULAR', 'Best seller')).toBe('Best seller');
    expect(badgeCopy('CUSTOM', 'Custom')).toBe('Custom');
  });

  it('renders text for every kind (colour is never the only signal) and nothing for an empty CUSTOM', () => {
    for (const kind of ['CORE', 'LIMITED', 'LOW', 'SOLD_OUT', 'UPCOMING', 'ENDED', 'POPULAR'] as const) {
      const { container, unmount } = render(<Badge kind={kind} />);
      expect(container.textContent?.length ?? 0).toBeGreaterThan(0);
      unmount();
    }
    const { container } = render(<Badge kind="CUSTOM" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('Limited uses the drop accent, with black text', () => {
    const { container } = render(<Badge kind="LIMITED" accent="LILAC" />);
    expect((container.firstChild as HTMLElement).className).toContain('bg-lilac');
    expect((container.firstChild as HTMLElement).className).toContain('text-ink');
  });
});

describe('PriceTag', () => {
  it('formats cents, prefix and compare-at', () => {
    render(<PriceTag cents={4500} prefix="from" compareAtCents={5500} />);
    expect(screen.getByText('$45')).toBeInTheDocument();
    expect(screen.getByText('from')).toBeInTheDocument();
    const was = screen.getByText('$55');
    expect(was.className).toContain('line-through');
    expect(was).toHaveTextContent('Was');
  });
  it('ignores a compare-at that is not higher', () => {
    render(<PriceTag cents={4500} compareAtCents={4500} />);
    expect(screen.queryByText('$45', { selector: '.line-through' })).toBeNull();
  });
  it('shows a zero label and fixed decimals', () => {
    const { rerender } = render(<PriceTag cents={0} zeroLabel="Free delivery" />);
    expect(screen.getByText('Free delivery')).toBeInTheDocument();
    rerender(<PriceTag cents={4500} fixed />);
    expect(screen.getByText('$45.00')).toBeInTheDocument();
  });
  it('uses tabular numbers', () => {
    const { container } = render(<PriceTag cents={4550} />);
    expect((container.firstChild as HTMLElement).className).toContain('tabular-nums');
  });
});

describe('Button', () => {
  it('loading sets aria-busy, keeps the label and ignores clicks', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Place order
      </Button>,
    );
    const b = screen.getByRole('button', { name: /Place order/ });
    expect(b).toHaveAttribute('aria-busy', 'true');
    expect(b).not.toBeDisabled();
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disabled buttons do not fire', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('href renders an anchor and external links get rel', () => {
    render(
      <>
        <Button href="/shop">Shop</Button>
        <Button href="https://example.com" target="_blank">
          Out
        </Button>
      </>,
    );
    expect(screen.getByRole('link', { name: 'Shop' })).toHaveAttribute('href', '/shop');
    const ext = screen.getByRole('link', { name: 'Out' });
    expect(ext).toHaveAttribute('rel', 'noopener noreferrer');
    expect(ext).toHaveAttribute('target', '_blank');
  });

  it('injects a framework Link through UIProvider or `as`', () => {
    const FakeLink = ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
      <a href={href} data-fake-link="yes" {...rest}>
        {children}
      </a>
    );
    render(
      <UIProvider link={FakeLink}>
        <Button href="/builder">Builder</Button>
        <Button href="/x" as={FakeLink}>
          Explicit
        </Button>
        <Button href="https://external.test">External stays an anchor</Button>
      </UIProvider>,
    );
    expect(screen.getByRole('link', { name: 'Builder' })).toHaveAttribute('data-fake-link', 'yes');
    expect(screen.getByRole('link', { name: 'Explicit' })).toHaveAttribute('data-fake-link', 'yes');
    expect(screen.getByRole('link', { name: 'External stays an anchor' })).not.toHaveAttribute('data-fake-link');
  });

  it('disabled link is aria-disabled and not focusable', () => {
    render(
      <Button href="/x" disabled>
        Nope
      </Button>,
    );
    const el = screen.getByRole('link', { name: 'Nope' });
    expect(el).toHaveAttribute('aria-disabled', 'true');
    expect(el).toHaveAttribute('tabindex', '-1');
    expect(el).not.toHaveAttribute('href');
  });

  it('maps cta and primary to blue, dark to black, danger to danger', () => {
    const { rerender } = render(<Button variant="cta">a</Button>);
    expect(screen.getByRole('button').className).toContain('bg-action');
    rerender(<Button variant="primary">a</Button>);
    expect(screen.getByRole('button').className).toContain('bg-action');
    rerender(<Button variant="dark">a</Button>);
    expect(screen.getByRole('button').className).toContain('bg-fg');
    rerender(<Button variant="danger">a</Button>);
    expect(screen.getByRole('button').className).toContain('bg-danger');
    rerender(<Button variant="coral">a</Button>);
    expect(screen.getByRole('button').className).toContain('text-ink');
  });

  it('has 44px default height and 52px large', () => {
    const { rerender } = render(<Button>a</Button>);
    expect(screen.getByRole('button').className).toContain('min-h-11');
    rerender(<Button size="lg">a</Button>);
    expect(screen.getByRole('button').className).toContain('min-h-13');
  });

  it('TextLink marks external links', () => {
    render(
      <>
        <TextLink href="https://instagram.com/stimpy" target="_blank">
          Instagram
        </TextLink>
        <TextLink href="/about">About</TextLink>
      </>,
    );
    const ext = screen.getByRole('link', { name: /Instagram/ });
    expect(ext).toHaveAttribute('rel', 'noopener noreferrer');
    expect(ext).toHaveTextContent('(opens in a new tab)');
    expect(screen.getByRole('link', { name: 'About' })).not.toHaveAttribute('rel');
  });
});

describe('WhatsApp', () => {
  it('builds a digits-only wa.me link in a new tab', () => {
    render(<WhatsAppButton number="+961 71 123 456" text="Hi Stimpy" />);
    const a = screen.getByRole('link', { name: 'Confirm on WhatsApp' });
    expect(a).toHaveAttribute('href', 'https://wa.me/96171123456?text=Hi%20Stimpy');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
  });
  it('renders nothing when the number is null', () => {
    const { container } = render(<WhatsAppButton number={null} />);
    expect(container).toBeEmptyDOMElement();
    const f = render(<FloatingWhatsApp number={null} />);
    expect(f.container).toBeEmptyDOMElement();
  });
  it('floating button has an accessible name and hides on demand', () => {
    const { container, rerender } = render(<FloatingWhatsApp number="+96171123456" />);
    expect(screen.getByRole('link', { name: 'Chat with Stimpy on WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/96171123456?text=Hi%20Stimpy',
    );
    rerender(<FloatingWhatsApp number="+96171123456" hidden />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function Trigger({ calls }: { calls: Array<(t: ReturnType<typeof useToast>) => void> }) {
    const t = useToast();
    return (
      <>
        {calls.map((c, i) => (
          <button key={i} onClick={() => c(t)}>
            fire{i}
          </button>
        ))}
      </>
    );
  }

  it('uses role=status for success/info and role=alert for errors, and auto-dismisses after 4 s', () => {
    render(
      <ToastProvider>
        <Trigger calls={[(t) => t.success('Saved'), (t) => t.error('Failed')]} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('fire0'));
    fireEvent.click(screen.getByText('fire1'));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    act(() => {
      vi.advanceTimersByTime(3900);
    });
    expect(screen.getByText('Saved')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.queryByText('Failed')).toBeNull();
  });

  it('keeps error toasts until dismissed when persistErrors (admin)', () => {
    render(
      <ToastProvider persistErrors>
        <Trigger calls={[(t) => t.error('Server error'), (t) => t.info('FYI')]} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('fire0'));
    fireEvent.click(screen.getByText('fire1'));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Server error')).toBeInTheDocument();
    expect(screen.queryByText('FYI')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Server error')).toBeNull();
  });

  it('stacks at most 3 and de-duplicates identical messages', () => {
    render(
      <ToastProvider>
        <Trigger
          calls={[
            (t) => {
              t.info('one');
              t.info('two');
              t.info('three');
              t.info('four');
            },
            (t) => {
              t.info('four');
              t.info('four');
            },
          ]}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('fire0'));
    expect(screen.queryByText('one')).toBeNull();
    expect(screen.getByText('two')).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(3);
    fireEvent.click(screen.getByText('fire1'));
    expect(screen.getAllByText('four')).toHaveLength(1);
    expect(screen.getAllByRole('status')).toHaveLength(3);
  });

  it('useToast throws without a provider; CopyButton still works without one', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useToast())).toThrow(/ToastProvider/);
    spy.mockRestore();
    render(<CopyButton text="STP-1042" label="Copy order number" />);
    expect(screen.getByRole('button', { name: /Copy order number/ })).toBeInTheDocument();
  });
});

describe('CopyButton', () => {
  it('copies and announces "Copied"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<CopyButton text="STP-1042" label="Copy order number" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copy order number/ }));
    });
    expect(writeText).toHaveBeenCalledWith('STP-1042');
    expect(screen.getAllByText('Copied').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('status').some((n) => n.textContent === 'Copied')).toBe(true);
  });
});

describe('Feedback components', () => {
  it('ErrorState shows the request id line only when there is one', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState onRetry={onRetry} requestId="4c1f0a9e" />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'If it keeps happening, message us and quote this code: 4c1f0a9e',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<ErrorState onRetry={onRetry} />);
    expect(screen.queryByText(/quote this code/)).toBeNull();
    rerender(<ErrorState requestId={null} />);
    expect(screen.queryByText(/quote this code/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('EmptyState renders title, text and action', () => {
    render(<EmptyState title="Your cart is empty" text="Add a hoodie." action={<Button>Shop</Button>} />);
    expect(screen.getByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shop' })).toBeInTheDocument();
  });

  it('Banner: role=alert only for errors', () => {
    const { rerender } = render(<Banner variant="info">Heads up</Banner>);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<Banner variant="warning">Careful</Banner>);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<Banner variant="error">Broken</Banner>);
    expect(screen.getByRole('alert')).toHaveTextContent('Broken');
  });

  it('Banner colours follow the brand pairs', () => {
    const { container, rerender } = render(<Banner variant="info">x</Banner>);
    expect((container.firstChild as HTMLElement).className).toMatch(/bg-sky.*text-ink/);
    rerender(<Banner variant="warning">x</Banner>);
    expect((container.firstChild as HTMLElement).className).toMatch(/bg-butter.*text-ink/);
    rerender(<Banner variant="announcement">x</Banner>);
    expect((container.firstChild as HTMLElement).className).toMatch(/bg-ink.*text-white/);
  });

  it('dismissible banner calls onDismiss', () => {
    const onDismiss = vi.fn();
    render(
      <Banner dismissible onDismiss={onDismiss}>
        x
      </Banner>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('AnnouncementBar renders a region with an underlined link, or nothing without text', () => {
    const { container, rerender } = render(<AnnouncementBar text="Drop 03 is live" linkUrl="/drops/drop-03" />);
    const region = screen.getByRole('region', { name: 'Announcement' });
    expect(within(region).getByRole('link')).toHaveAttribute('href', '/drops/drop-03');
    expect(within(region).getByRole('link').className).toContain('underline');
    rerender(<AnnouncementBar text="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('ProgressBar is a progressbar with values, or indeterminate', () => {
    const { rerender } = render(<ProgressBar value={40} aria-label="Uploading" />);
    const bar = screen.getByRole('progressbar', { name: 'Uploading' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    rerender(<ProgressBar aria-label="Uploading" />);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });

  it('Skeleton is decorative and keeps the final aspect ratio', () => {
    const { container } = render(<Skeleton variant="card" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(((container.firstElementChild as HTMLElement).firstElementChild as HTMLElement).style.aspectRatio).toBe('0.64');
    const r = render(<Skeleton variant="rect" ratio="4 / 5" />);
    expect((r.container.firstElementChild as HTMLElement).style.aspectRatio).toBe('4 / 5');
  });

  it('skeleton delay: nothing for fast loads, shown after 150 ms and kept for 300 ms', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ loading }) => useSkeletonDelay(loading), { initialProps: { loading: true } });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ loading: false }); // fast load: never flashes
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(false);

    rerender({ loading: true });
    act(() => {
      vi.advanceTimersByTime(151);
    });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ loading: false }); // finished 100 ms after showing: stays up for 200 ms more
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe(false);
    vi.useRealTimers();
  });
});

describe('Accordion', () => {
  const items = [
    { id: 'a', question: 'How long is delivery?', answer: 'Two **working** days.' },
    { id: 'b', question: 'Can I swap?', answer: 'Yes.' },
  ];
  it('is built on details/summary with aria-expanded and renders answers with RichText', () => {
    const { container } = render(<Accordion items={items} />);
    expect(container.querySelectorAll('details')).toHaveLength(2);
    const summary = screen.getByText('How long is delivery?').closest('summary') as HTMLElement;
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    const details = summary.parentElement as HTMLDetailsElement;
    act(() => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    expect(summary).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('strong')).toHaveTextContent('working');
  });
  it('single mode closes the other panel; allowMultiple keeps both', () => {
    const open = (el: HTMLElement) => {
      const d = el.closest('details') as HTMLDetailsElement;
      act(() => {
        d.open = true;
        d.dispatchEvent(new Event('toggle'));
      });
    };
    const { unmount } = render(<Accordion items={items} />);
    open(screen.getByText('How long is delivery?'));
    open(screen.getByText('Can I swap?'));
    expect(screen.getByText('How long is delivery?').closest('summary')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Can I swap?').closest('summary')).toHaveAttribute('aria-expanded', 'true');
    unmount();
    render(<Accordion items={items} allowMultiple />);
    open(screen.getByText('How long is delivery?'));
    open(screen.getByText('Can I swap?'));
    expect(screen.getByText('How long is delivery?').closest('summary')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Can I swap?').closest('summary')).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('Cards', () => {
  const stimpie: StimpieLike = {
    slug: 'neon-koi',
    name: 'Neon Koi',
    type: 'LIMITED',
    priceCents: 1500,
    images: [],
    artworkUrl: '/art.png',
    drop: { slug: 'drop-03', name: 'Drop 03', accentColor: 'SKY' },
    status: 'LOW',
    remaining: 4,
    purchasable: true,
  };

  it('StimpieCard: image uses a 0.64 box, LOW shows "Last few · n left", add button has a name', () => {
    const onAdd = vi.fn();
    const { container } = render(<StimpieCard stimpie={stimpie} onAdd={onAdd} showDrop />);
    expect(container.querySelector<HTMLElement>('[style*="aspect-ratio"]')?.style.aspectRatio).toBe('0.64');
    expect(screen.getByText(/Last few/)).toHaveTextContent('Last few · 4 left');
    expect(screen.getByText('Limited')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Neon Koi' })).toHaveAttribute('href', '/shop/stimpie/neon-koi');
    expect(screen.getByText('Drop 03').className).toContain('bg-sky');
    fireEvent.click(screen.getByRole('button', { name: 'Add Neon Koi to cart' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('StimpieCard: not purchasable is muted, has no add button and shows its status as text', () => {
    render(<StimpieCard stimpie={{ ...stimpie, status: 'SOLD_OUT', purchasable: false, remaining: null }} onAdd={() => undefined} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getAllByText('Sold out').length).toBeGreaterThan(0);
  });

  it('StimpieCard picker mode is a toggle button with aria-pressed', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<StimpieCard stimpie={stimpie} selectable selected={false} onSelect={onSelect} />);
    const btn = screen.getByRole('button', { name: /Neon Koi/ });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(onSelect).toHaveBeenCalled();
    rerender(<StimpieCard stimpie={stimpie} selectable selected onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /Neon Koi/ })).toHaveAttribute('aria-pressed', 'true');
    rerender(<StimpieCard stimpie={{ ...stimpie, purchasable: false, status: 'SOLD_OUT' }} selectable onSelect={onSelect} />);
    onSelect.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Neon Koi/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ProductCard: from price, up to five colour dots with +n, sold out badge, 4:5 image', () => {
    const colors = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: `Colour ${i + 1}`, hex: '#111111' }));
    const { container } = render(
      <ProductCard hoodie={{ slug: 'core', name: 'Core Hoodie', priceCents: 6000, images: ['/h.jpg'], colors, inStock: false }} />,
    );
    expect(screen.getByText('from')).toBeInTheDocument();
    expect(screen.getByText('$60')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Colours' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(6); // 5 dots + "+2"
    expect(within(list).getByText('+2')).toBeInTheDocument();
    expect(within(list).getByText('Colour 1')).toBeInTheDocument(); // name as accessible text
    expect(screen.getByText('Sold out')).toBeInTheDocument();
    expect(container.querySelector<HTMLElement>('[style*="aspect-ratio"]')?.style.aspectRatio).toBe('4 / 5');
    expect(screen.getByRole('link', { name: 'Core Hoodie' })).toHaveAttribute('href', '/shop/hoodie/core');
  });

  it('ProductCard omits the colour row when there are no colours', () => {
    render(<ProductCard hoodie={{ slug: 'x', name: 'X', priceCents: 1, images: [], colors: [], inStock: true }} />);
    expect(screen.queryByRole('list', { name: 'Colours' })).toBeNull();
  });

  it('PackCard: badge, price, optional extra line and CTA', () => {
    const onChoose = vi.fn();
    render(
      <PackCard
        pack={{ name: 'Hoodie + 2 Stimpies', description: 'Two backs.', priceCents: 8000, badge: 'Most popular' }}
        effectiveExtraCents={2000}
        highlight
        onChoose={onChoose}
      />,
    );
    expect(screen.getByText('Most popular')).toBeInTheDocument();
    expect(screen.getByText('$80')).toBeInTheDocument();
    expect(screen.getByText(/Second Stimpie effectively/)).toHaveTextContent('$20');
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }));
    expect(onChoose).toHaveBeenCalled();
  });

  it('StatCard shows value with a delta that carries a sign in text', () => {
    render(<StatCard label="Orders today" value="12" delta={{ text: '+3 vs yesterday', tone: 'up' }} />);
    expect(screen.getByText('Orders today')).toBeInTheDocument();
    expect(screen.getByText('+3 vs yesterday')).toBeInTheDocument();
  });
});

describe('Media', () => {
  it('shows a cream tile with an icon when there is no image or it fails, keeping the ratio', () => {
    const { container } = render(<Media alt="Neon Koi" ratio={0.64} src={null} />);
    expect(screen.getByRole('img', { name: 'Neon Koi' })).toBeInTheDocument();
    expect((container.firstChild as HTMLElement).style.aspectRatio).toBe('0.64');
    expect((container.firstChild as HTMLElement).className).toContain('bg-cream');
  });
  it('falls back after an image error', () => {
    const { container } = render(<Media alt="x" ratio="4/5" src="/broken.png" />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img).toHaveAttribute('loading', 'lazy');
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'x' })).toBeInTheDocument();
  });
  it('priority images load eagerly', () => {
    const { container } = render(<Media alt="hero" ratio="16/9" src="/h.png" priority />);
    expect(container.querySelector('img')).toHaveAttribute('loading', 'eager');
  });
  it('supports an injected image renderer', () => {
    render(
      <UIProvider renderImage={({ src, alt }) => <span data-testid="custom-image">{`${alt}|${src}`}</span>}>
        <Media alt="a" ratio={1} src="/z.png" />
      </UIProvider>,
    );
    expect(screen.getByTestId('custom-image')).toHaveTextContent('a|/z.png');
  });
});

describe('Layout and brand', () => {
  it('Section tones carry the exact text colour pairs', () => {
    const pairs: Array<[Parameters<typeof Section>[0]['tone'], string, string]> = [
      ['white', 'bg-white', 'text-ink'],
      ['cream', 'bg-cream', 'text-ink'],
      ['black', 'bg-ink', 'text-white'],
      ['coral', 'bg-coral', 'text-ink'],
    ];
    for (const [tone, bg, text] of pairs) {
      const { container, unmount } = render(<Section tone={tone}>x</Section>);
      const cls = (container.firstChild as HTMLElement).className;
      expect(cls, tone).toContain(bg);
      expect(cls, tone).toContain(text);
      unmount();
    }
    for (const [accent, bg] of [['BUTTER', 'bg-butter'], ['SKY', 'bg-sky'], ['LILAC', 'bg-lilac']] as const) {
      const { container, unmount } = render(<Section tone="accent" accentColor={accent}>x</Section>);
      const cls = (container.firstChild as HTMLElement).className;
      expect(cls).toContain(bg);
      expect(cls).toContain('text-ink');
      unmount();
    }
  });

  it('black Section switches to the dark semantic surface', () => {
    const { container } = render(<Section tone="black">x</Section>);
    expect((container.firstChild as HTMLElement).className).toContain('surface-dark');
  });

  it('Section renders heading and eyebrow and a container', () => {
    const { container } = render(
      <Section tone="cream" heading="Packs" eyebrow="Pick one">
        body
      </Section>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Packs' })).toBeInTheDocument();
    expect(screen.getByText('Pick one')).toBeInTheDocument();
    expect(container.querySelector('.container')).not.toBeNull();
  });

  it('SkipLink targets main content', () => {
    render(<SkipLink />);
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content');
  });

  it('TrustStrip shows the four default points and accepts custom items', () => {
    const { unmount } = render(<TrustStrip />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Cash on delivery')).toBeInTheDocument();
    unmount();
    render(<TrustStrip items={[{ text: 'Only one' }]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('Avatar shows initials with the full name as accessible name', () => {
    render(<Avatar name="Tarek Aswad" />);
    expect(screen.getByRole('img', { name: 'Tarek Aswad' })).toHaveTextContent('TA');
  });
});

describe('Logo', () => {
  it('renders the official version per surface from public files and respects minimum sizes', () => {
    const { container, rerender } = render(
      <UIProvider logoBaseUrl="/brand">
        <Logo variant="full" surface="black" width={200} />
      </UIProvider>,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/brand/logo-on-black.webp');
    expect(img).toHaveAttribute('alt', 'Stimpy');
    expect(img.width).toBe(200);
    rerender(
      <UIProvider logoBaseUrl="/brand/">
        <Logo variant="full" surface="coral" width={40} />
      </UIProvider>,
    );
    const small = container.querySelector('img') as HTMLImageElement;
    expect(small.getAttribute('src')).toBe('/brand/logo-main.webp');
    expect(small.width).toBe(LOGO_MIN_WIDTH.full); // clamped to 96
    rerender(
      <UIProvider logoBaseUrl="/brand">
        <Logo variant="icon" surface="white" width={8} />
      </UIProvider>,
    );
    const icon = container.querySelector('img') as HTMLImageElement;
    expect(icon.getAttribute('src')).toBe('/brand/icon-on-white.png');
    expect(icon.width).toBe(LOGO_MIN_WIDTH.icon); // clamped to 20
  });

  it('has clear space and never recolours or adds effects', () => {
    const { container } = render(<Logo variant="full" surface="white" width={240} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('p-logo');
    expect(wrapper.style.getPropertyValue('--logo-clear')).toBe('29px'); // 12% of the width
    expect(wrapper.className).not.toMatch(/shadow|filter|blur|drop-shadow|rotate|grayscale/);
    const icon = render(<Logo variant="icon" width={40} />).container.firstChild as HTMLElement;
    expect(icon.style.getPropertyValue('--logo-clear')).toBe('20px'); // half the icon width
  });

  it('maps surfaces to bundled files', () => {
    const { container } = render(<Logo surface="white" />);
    expect((container.querySelector('img') as HTMLImageElement).src).toContain('logo-on-white.webp');
    const b = render(<Logo surface="black" variant="icon" />);
    expect((b.container.querySelector('img') as HTMLImageElement).src).toContain('icon-on-black.png');
  });
});

describe('StatusTimeline', () => {
  const steps = [
    { status: 'NEW', label: 'Received' },
    { status: 'CONFIRMED', label: 'Confirmed' },
    { status: 'PACKED', label: 'Packed' },
    { status: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
    { status: 'DELIVERED', label: 'Delivered' },
  ] as const;
  const timeline = [
    { status: 'NEW', at: '2026-10-14T09:30:00Z' },
    { status: 'CONFIRMED', at: '2026-10-14T10:30:00Z' },
  ] as const;

  it('marks done, current and upcoming with text, and sets aria-current on the current step', () => {
    render(<StatusTimeline steps={[...steps]} timeline={[...timeline]} current="CONFIRMED" />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent('(completed)');
    expect(items[0]).toHaveTextContent('14 Oct 2026, 12:30');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[1]).toHaveTextContent('(current step)');
    expect(items[2]).toHaveTextContent('(upcoming)');
    expect(items[2]).toHaveTextContent('Upcoming');
  });

  it('adds a terminal step for CANCELLED and marks unreached steps', () => {
    render(
      <StatusTimeline
        steps={[...steps]}
        timeline={[...timeline, { status: 'CANCELLED', at: '2026-10-14T11:00:00Z' }]}
        current="CANCELLED"
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(6);
    expect(items[5]).toHaveTextContent('Cancelled');
    expect(items[5]).toHaveTextContent('(final status)');
    expect(items[2]).toHaveTextContent('(not reached)');
  });

  it('treats the last happy-path status as complete, not "current"', () => {
    render(
      <StatusTimeline
        steps={[...steps]}
        timeline={steps.map((s) => ({ status: s.status, at: '2026-10-14T09:30:00Z' }))}
        current="DELIVERED"
      />,
    );
    expect(screen.getAllByRole('listitem').filter((li) => li.getAttribute('aria-current'))).toHaveLength(0);
    expect(screen.getAllByText('(completed)', { exact: false })).toHaveLength(5);
  });

  it('formats times in the given zone', () => {
    render(<StatusTimeline steps={[...steps]} timeline={[...timeline]} current="CONFIRMED" timeZone="UTC" />);
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('14 Oct 2026, 09:30');
  });
});

describe('RichText reachable from the barrel', () => {
  it('renders', () => {
    render(<RichText text="Hello **world**" />);
    expect(screen.getByText('world').tagName).toBe('STRONG');
  });
});

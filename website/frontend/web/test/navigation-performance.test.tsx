import { startTransition, type ComponentProps } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationLink } from '@/components/NavigationLink';
import { UrlTabs } from '@/components/UrlTabs';
import { ShopTabs, StimpieFilters } from '@/features/shop/ShopControls';
import { DEFAULT_SHOP_PARAMS } from '@/features/shop/params';

const { router, status } = vi.hoisted(() => ({
  router: { prefetch: vi.fn(), replace: vi.fn() },
  status: { pending: false },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => <a {...props} />,
  useLinkStatus: () => status,
}));

beforeEach(() => {
  vi.clearAllMocks();
  status.pending = false;
  Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
});

function pendingNavigation() {
  let finish!: () => void;
  const response = new Promise<void>((resolve) => { finish = resolve; });
  router.replace.mockImplementation(() => {
    startTransition(async () => { await response; });
  });
  return finish;
}

describe('navigation loading and prefetch', () => {
  it('warms an intended destination without downloading every rendered card route', () => {
    const onFocus = vi.fn();
    const view = render(<NavigationLink href="/shop/stimpie/void" onFocus={onFocus}>The Void</NavigationLink>);
    const link = view.getByRole('link');
    expect(router.prefetch).not.toHaveBeenCalled();
    fireEvent.mouseEnter(link);
    fireEvent.focus(link);
    fireEvent.touchStart(link);
    expect(router.prefetch).toHaveBeenCalledExactlyOnceWith('/shop/stimpie/void');
    expect(onFocus).toHaveBeenCalledOnce();
  });

  it('honors Save Data, explicit opt-outs and external URLs', () => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
    const view = render(<NavigationLink href="/builder">Builder</NavigationLink>);
    fireEvent.mouseEnter(view.getByRole('link'));
    expect(router.prefetch).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
    view.rerender(<NavigationLink href="/builder" prefetch={false}>Builder</NavigationLink>);
    fireEvent.focus(view.getByRole('link'));
    view.rerender(<NavigationLink href="https://example.com">External</NavigationLink>);
    fireEvent.touchStart(view.getByRole('link'));
    expect(router.prefetch).not.toHaveBeenCalled();
  });

  it('shows feedback only while Next reports an active navigation', () => {
    const view = render(<NavigationLink href="/shop">Shop</NavigationLink>);
    expect(view.queryByRole('status')).not.toBeInTheDocument();
    status.pending = true;
    view.rerender(<NavigationLink href="/shop">Shop</NavigationLink>);
    expect(view.getByRole('status', { name: 'Loading page' })).toBeInTheDocument();
    status.pending = false;
    view.rerender(<NavigationLink href="/shop">Shop</NavigationLink>);
    expect(view.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('controls during a slow server navigation', () => {
  it('selects a shop tab immediately and replaces stale content with a loading state', async () => {
    const finish = pendingNavigation();
    const view = render(<ShopTabs params={DEFAULT_SHOP_PARAMS}><h2>Hoodie results</h2></ShopTabs>);
    fireEvent.click(view.getByRole('tab', { name: 'Stimpies' }));
    expect(view.getByRole('tab', { name: 'Stimpies' })).toHaveAttribute('aria-selected', 'true');
    expect(view.getByRole('status')).toHaveTextContent('Loading');
    expect(view.queryByRole('heading', { name: 'Hoodie results' })).not.toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledWith('/shop?tab=stimpies', { scroll: false });
    view.rerender(<ShopTabs params={{ ...DEFAULT_SHOP_PARAMS, tab: 'stimpies' }}><h2>Stimpie results</h2></ShopTabs>);
    await act(async () => { finish(); });
    expect(view.getByRole('heading', { name: 'Stimpie results' })).toBeVisible();
    expect(view.queryByRole('status')).not.toBeInTheDocument();
  });

  it('preserves earlier filter selections when another filter changes before the response arrives', async () => {
    const finish = pendingNavigation();
    const view = render(<StimpieFilters params={{ ...DEFAULT_SHOP_PARAMS, tab: 'stimpies' }} drops={[]} activeCount={0} />);
    fireEvent.click(view.getByRole('radio', { name: 'Core' }));
    expect(view.getByRole('radio', { name: 'Core' })).toBeChecked();
    fireEvent.click(view.getByRole('switch', { name: 'Hide sold out' }));
    expect(view.getByRole('switch', { name: 'Hide sold out' })).toHaveAttribute('aria-checked', 'true');
    expect(router.replace).toHaveBeenLastCalledWith('/shop?tab=stimpies&type=CORE&soldOut=hide', { scroll: false });
    await act(async () => { finish(); });
  });

  it('updates help tabs while retaining a stable pending panel', async () => {
    const finish = pendingNavigation();
    const tabs = [{ id: 'size', label: 'Size guide' }, { id: 'care', label: 'Care' }];
    const view = render(<UrlTabs tabs={tabs} value="size" label="Help" basePath="/help"><p>Size chart</p></UrlTabs>);
    fireEvent.click(view.getByRole('tab', { name: 'Care' }));
    expect(view.getByRole('tab', { name: 'Care' })).toHaveAttribute('aria-selected', 'true');
    expect(view.getByRole('status')).toHaveTextContent('Loading');
    expect(router.replace).toHaveBeenCalledWith('/help?tab=care', { scroll: false });
    await act(async () => { finish(); });
  });
});

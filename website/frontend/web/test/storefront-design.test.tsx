import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { usesDefaultCampaign } from '@/components/StoreHero';
import { HomeCommerce, PackTile } from '@/features/home/HomeCommerce';
import { packs, stimpie } from './fixtures';

vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));

describe('storefront campaign selection', () => {
  it('replaces only absent images or the bundled lookbook', () => {
    expect(usesDefaultCampaign(null)).toBe(true);
    expect(usesDefaultCampaign('http://localhost:4000/uploads/seed/photos/lookbook-ee58d20a.webp')).toBe(true);
    expect(usesDefaultCampaign('/uploads/seed/photos/lookbook-other.webp')).toBe(true);
    expect(usesDefaultCampaign('https://cdn.shop.com/uploads/campaign.webp')).toBe(false);
    expect(usesDefaultCampaign('/uploads/custom/hero.webp')).toBe(false);
    expect(usesDefaultCampaign('/uploads/custom/lookbook-editorial.webp')).toBe(false);
  });
});

describe('storefront commerce previews', () => {
  it('retains a usable pack link without JavaScript', () => {
    const view = render(<PackTile pack={packs[1]!} hoodieSlug="stimpy-hoodie" extraCents={1000} />);
    expect(view.getByRole('link', {name: 'Choose this set'})).toHaveAttribute('href', '/shop/hoodie/stimpy-hoodie?pack=two');
    expect(view.getByText('Second Stimpie effectively $10')).toBeVisible();
  });
  it('uses the interactive choose handler when hydrated', () => {
    const onChoose = vi.fn();
    const view = render(<PackTile pack={packs[0]!} hoodieSlug="stimpy-hoodie" onChoose={onChoose} />);
    fireEvent.click(view.getByRole('button', { name: 'Choose this set' }));
    expect(onChoose).toHaveBeenCalledOnce();
  });
  it('does not offer a nonexistent hoodie and handles an empty collection', () => {
    const view = render(<HomeCommerce packs={[]} hoodieSlug={null} extraCents={0} minExtra={null} drop={null} coreStimpies={[]} />);
    expect(view.getByRole('link', {name: 'Shop the hoodie'})).toHaveAttribute('href','/shop');
    expect(view.queryByRole('list', {name:'Core Stimpies'})).not.toBeInTheDocument();
  });
  it('keeps product detail links and full artwork in the server preview', () => {
    const view = render(<HomeCommerce packs={[]} hoodieSlug={null} extraCents={0} minExtra={1000} drop={null} coreStimpies={[stimpie()]} />);
    expect(view.getByRole('link', {name:'THE VOID'})).toHaveAttribute('href','/shop/stimpie/the-void');
    expect(view.getByRole('link', {name:'Stimpies from $10'})).toHaveAttribute('href','/shop?tab=stimpies');
  });
});

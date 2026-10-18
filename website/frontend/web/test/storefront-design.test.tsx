import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { StoreHero, usesDefaultCampaign } from '@/components/StoreHero';
import { HomeCommerce, PackTile } from '@/features/home/HomeCommerce';
import { HomeHowItWorks } from '@/features/home/HomeHowItWorks';
import { Footer } from '@/components/layout/Footer';
import { packs, stimpie } from './fixtures';

vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
vi.mock('@/components/NavigationLink', () => ({ NavigationLink: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
vi.mock('@/components/LoopVideo', () => ({ LoopVideo: ({ src, label }: { src: string; label: string }) => <video src={src} aria-label={label} /> }));

describe('storefront campaign selection', () => {
  it('replaces only absent images or the bundled lookbook', () => {
    expect(usesDefaultCampaign(null)).toBe(true);
    expect(usesDefaultCampaign('http://localhost:4000/uploads/seed/photos/lookbook-ee58d20a.webp')).toBe(true);
    expect(usesDefaultCampaign('/uploads/seed/photos/lookbook-other.webp')).toBe(true);
    expect(usesDefaultCampaign('https://cdn.shop.com/uploads/campaign.webp')).toBe(false);
    expect(usesDefaultCampaign('/uploads/custom/hero.webp')).toBe(false);
    expect(usesDefaultCampaign('/uploads/custom/lookbook-editorial.webp')).toBe(false);
  });
  it('uses the dashboard headline as the main page heading', () => {
    const view = render(<StoreHero homepage={{ heroHeadline: 'Your next favourite hoodie', heroSubheadline: 'Made to change with you.' }} hoodieHref="/shop/hoodie/essential" />);
    expect(view.getByRole('heading', { level: 1 })).toHaveTextContent('Your next favourite hoodie');
    expect(view.getByText('Made to change with you.')).toBeVisible();
    expect(view.getByRole('link', { name: 'Shop the hoodie' })).toHaveAttribute('href', '/shop/hoodie/essential');
  });
  it.each(['', ' \n '])('keeps a readable heading when the saved headline is blank', (heroHeadline) => {
    const view = render(<StoreHero homepage={{ heroHeadline, heroSubheadline: '' }} hoodieHref="/shop" />);
    expect(view.getByRole('heading', { level: 1 })).toHaveTextContent('The Stimpy hoodie.');
  });
});

describe('homepage authored steps', () => {
  it('renders a short guide with its formatting, image and video', async () => {
    const view = render(<HomeHowItWorks steps={[
      { title: 'Zip yours on', text: 'Keep the **zipper aligned**.\n\n- Start at the bottom', mediaUrl: 'https://cdn.example.test/zip.webp' },
      { title: 'Make a change', text: 'Try a fresh back tomorrow.', mediaUrl: 'https://cdn.example.test/swap.mp4' },
    ]} />);
    expect(view.getByRole('heading', { name: 'Zip yours on' })).toBeVisible();
    expect(view.getByText('zipper aligned').tagName).toBe('STRONG');
    expect(view.getByRole('img', { name: 'Zip yours on' })).toBeVisible();
    expect(await view.findByLabelText('Make a change')).toHaveAttribute('src', 'https://cdn.example.test/swap.mp4');
    expect(view.queryByText('Start with the hoodie')).not.toBeInTheDocument();
    expect(view.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/how-it-works');
  });
  it('links the first-three preview to the full guide and keeps a fallback for empty content', () => {
    const steps = Array.from({ length: 4 }, (_, i) => ({ title: `Authored step ${i + 1}`, text: '', mediaUrl: null }));
    const view = render(<HomeHowItWorks steps={steps} />);
    expect(view.getByRole('heading', { name: 'Authored step 3' })).toBeVisible();
    expect(view.queryByText('Authored step 4')).not.toBeInTheDocument();
    view.rerender(<HomeHowItWorks steps={[]} />);
    expect(view.getByRole('heading', { name: 'Start with the hoodie' })).toBeVisible();
  });
});

describe('storefront footer settings and content links', () => {
  it('uses the configured business details and links to every content guide', () => {
    const view = render(<Footer business={{ name: 'Stimpy Lebanon', whatsappNumber: '+96171123456', supportEmail: 'care@example.test', instagramUrl: 'https://instagram.com/example', timezone: 'Asia/Beirut' }} />);
    expect(view.getByText(`© ${new Date().getFullYear()} Stimpy Lebanon`)).toBeVisible();
    expect(view.getByRole('link', { name: 'care@example.test' })).toHaveAttribute('href', 'mailto:care@example.test');
    expect(view.getByRole('link', { name: /^WhatsApp/ })).toHaveAttribute('href', expect.stringContaining('wa.me/96171123456'));
    expect(view.getByRole('link', { name: /^Instagram/ })).toHaveAttribute('href', 'https://instagram.com/example');
    for (const [name, href] of [['About', '/about'], ['Legal', '/legal'], ['Delivery', '/delivery-returns'], ['Size guide & FAQ', '/help'], ['How it works', '/how-it-works']]) {
      expect(view.getByRole('link', { name })).toHaveAttribute('href', href);
    }
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

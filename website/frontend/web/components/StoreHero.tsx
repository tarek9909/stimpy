import { NavigationLink as Link } from './NavigationLink';
import type { Content, Stimpie } from '@stimpy/api-client';
import { ArrowRight } from '@/components/icons';
import { campaignImages } from '@/lib/campaign-images';

/** Identify the bundled campaign in legacy homepage content. */
export function usesDefaultCampaign(imageUrl: string | null | undefined): boolean {
  if (!imageUrl) return true;
  try {
    return new URL(imageUrl, 'http://localhost').pathname.startsWith('/uploads/seed/photos/lookbook-');
  } catch {
    return false;
  }
}

export function StoreHero({ homepage, stimpie = null, hoodieHref }: { homepage: Pick<Content['homepage'], 'heroHeadline' | 'heroSubheadline'>; stimpie?: Stimpie | null; hoodieHref: string }) {
  const { desktop, mobile } = campaignImages;

  return (
    <section className="store-hero" aria-labelledby="store-hero-title">
      <picture className="store-hero-picture">
        <source media="(max-width: 767px)" type="image/avif" srcSet={mobile.avifSrcSet} sizes="100vw" width={mobile.width} height={mobile.height} />
        <source media="(max-width: 767px)" type="image/webp" srcSet={mobile.webpSrcSet} sizes="100vw" width={mobile.width} height={mobile.height} />
        <source type="image/avif" srcSet={desktop.avifSrcSet} sizes="100vw" />
        <img src={desktop.src} srcSet={desktop.webpSrcSet} sizes="100vw" width={desktop.width} height={desktop.height}
          alt="Black Stimpy hoodie with an interchangeable back panel" fetchPriority="high" loading="eager" decoding="async" />
      </picture>
      {stimpie ? <img className="store-hero-artwork" src={stimpie.artworkUrl} alt="" aria-hidden="true" /> : null}
      <div className="container store-hero-inner">
        <div className="store-hero-copy">
          <p className="store-eyebrow"><span className="store-brand-mark" aria-hidden="true" /> Built to be different</p>
          <h1 id="store-hero-title">{homepage.heroHeadline.trim() || 'The Stimpy hoodie.'}</h1>
          <p className="store-hero-description">{homepage.heroSubheadline}</p>
          <div className="store-hero-actions">
            <Link href={hoodieHref} className="store-button">Shop the hoodie <ArrowRight size={18} aria-hidden="true" /></Link>
            <Link href="/shop?tab=stimpies" className="store-text-link">Explore Stimpies <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>
      </div>
      <div className="store-hero-caption" role="note" aria-label="Featured Stimpie artwork">
        <div className="store-hero-caption-head">
          <strong>{stimpie?.name ?? 'Interchangeable back panel'}</strong>
          {stimpie?.story ? <span className="store-hero-caption-slash" aria-hidden="true">/</span> : null}
        </div>
        {stimpie?.story ? (
          <p className="store-hero-caption-quote">“{stimpie.story}”</p>
        ) : null}
      </div>
    </section>
  );
}

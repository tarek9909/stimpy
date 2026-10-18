import { getImageProps } from 'next/image';
import Link from 'next/link';
import type { Content } from '@stimpy/api-client';
import { ArrowRight } from '@/components/icons';
import { HeroMedia } from './HeroMedia';

/** Keep merchant-uploaded campaigns; only replace the bundled seed lookbook. */
export function usesDefaultCampaign(imageUrl: string | null | undefined): boolean {
  if (!imageUrl) return true;
  try {
    return new URL(imageUrl, 'http://localhost').pathname.startsWith('/uploads/seed/photos/lookbook-');
  } catch {
    return false;
  }
}

export function StoreHero({ homepage, hoodieHref }: { homepage: Content['homepage']; hoodieHref: string }) {
  const campaign = usesDefaultCampaign(homepage.heroImageUrl) && !homepage.heroVideoUrl;
  const desktop = getImageProps({
    src: '/images/stimpy-campaign-v1.png', alt: 'Black Stimpy hoodie with THE VOID interchangeable back panel',
    width: 1942, height: 809, sizes: '100vw',
  }).props;
  const mobile = getImageProps({
    src: '/images/stimpy-campaign-mobile-v1.png', alt: desktop.alt,
    width: 1024, height: 1536, sizes: '100vw',
  }).props;

  return (
    <section className={`store-hero${campaign ? '' : ' store-hero-custom'}`} aria-labelledby="store-hero-title">
      {campaign ? (
        <picture className="store-hero-picture">
          <source media="(max-width: 767px)" srcSet={mobile.srcSet} sizes="100vw" />
          <img {...desktop} alt={desktop.alt} fetchPriority="high" loading="eager" />
        </picture>
      ) : (
        <HeroMedia videoUrl={homepage.heroVideoUrl} imageUrl={homepage.heroImageUrl} alt="Stimpy campaign"
          ratio="12 / 5" sizes="100vw" priority className="store-custom-media" mediaClassName="!h-full !aspect-auto" />
      )}
      <div className="container store-hero-inner">
        <div className="store-hero-copy">
          <p className="store-eyebrow"><span className="store-brand-mark" aria-hidden="true" /> Built to be different</p>
          <h1 id="store-hero-title">The Stimpy<br />hoodie.</h1>
          <p className="store-hero-subtitle">{homepage.heroHeadline}</p>
          <p className="store-hero-description">{homepage.heroSubheadline}</p>
          <div className="store-hero-actions">
            <Link href={hoodieHref} className="store-button">Shop the hoodie <ArrowRight size={18} aria-hidden="true" /></Link>
            <Link href="/shop?tab=stimpies" className="store-text-link">Explore Stimpies <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>
        {campaign ? <p className="store-hero-caption">THE VOID <span>/</span> Interchangeable back panel</p> : null}
      </div>
    </section>
  );
}

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button, Media, PriceTag, RichText, STIMPIE_RATIO, formatCents } from '@stimpy/ui';
import type { Drop, Pack, Stimpie } from '@stimpy/api-client';
import { ArrowRight, Layers, Shirt, Zap } from '@/components/icons';

export function PackTile({ pack, hoodieSlug, extraCents, onChoose }: {
  pack: Pack; hoodieSlug: string | null; extraCents?: number; onChoose?: () => void;
}) {
  return (
    <article className={`store-pack${pack.badge ? ' store-pack-featured' : ''}`}>
      <div className="store-pack-top"><Shirt size={24} strokeWidth={1.5} aria-hidden="true" />
        {pack.badge ? <span className="store-pack-badge">{pack.badge}</span> : null}
      </div>
      <h3>{pack.name}</h3>
      <p className="store-pack-description">{pack.description}</p>
      <PriceTag cents={pack.priceCents} compareAtCents={pack.compareAtPriceCents ?? undefined} size="sm" className="store-pack-price" />
      {(extraCents ?? 0) > 0 ? <p className="text-body-sm text-fg-muted">Second Stimpie effectively {formatCents(extraCents!)}</p> : null}
      {hoodieSlug ? <Button variant={pack.badge ? 'dark' : 'secondary'} fullWidth
        {...(onChoose ? { onClick: onChoose } : { href: `/shop/hoodie/${hoodieSlug}?pack=${encodeURIComponent(pack.slug)}` })}
        className="mt-auto">Choose this set <ArrowRight size={16} aria-hidden="true" /></Button> : null}
    </article>
  );
}

export interface HomeCommerceProps {
  packs: Pack[]; hoodieSlug: string | null; extraCents: number; minExtra: number | null;
  drop: Drop | null; coreStimpies: Stimpie[];
  packCards?: ReactNode; stimpieCards?: ReactNode;
}

/** Identical section geometry for the server preview and deferred interactive cards. */
export function HomeCommerce(props: HomeCommerceProps) {
  return <>
    {props.coreStimpies.length > 0 ? <section className="store-section" aria-labelledby="core-title"><div className="container">
      <header className="store-section-heading"><div><p className="store-eyebrow">A different kind of wardrobe</p>
        <h2 id="core-title">Find your next identity.</h2><p>Original artwork. One zip away.</p></div>
        <Link href="/shop?tab=stimpies&type=CORE" className="store-text-link">All Stimpies <ArrowRight size={17} aria-hidden="true" /></Link>
      </header>
      <ul className="store-collection-grid" aria-label="Core Stimpies">
        {props.stimpieCards ?? props.coreStimpies.slice(0, 4).map((stimpie) => <li key={stimpie.id}>
          <article className="store-product-card store-static-product relative flex flex-col">
            <div><Media src={stimpie.images[0] ?? stimpie.artworkUrl} alt={`${stimpie.name} Stimpie`} ratio={STIMPIE_RATIO} sizes="(min-width: 768px) 25vw, 50vw" /></div>
            <div className="flex flex-1 flex-col"><h3 className="text-h4"><Link href={`/shop/stimpie/${stimpie.slug}`} className="after:absolute after:inset-0">{stimpie.name}</Link></h3><PriceTag cents={stimpie.priceCents} compareAtCents={stimpie.compareAtPriceCents ?? undefined} size="sm" /></div>
          </article>
        </li>)}
      </ul>
    </div></section> : null}
    {props.drop ? (
      <section className="store-drop-band" aria-labelledby="home-drop-title">
        <div className="container">
          <div className="store-drop-showcase">
            <div className="store-drop-glow" aria-hidden="true" />
            <div className="store-drop-grid">
              <div className="store-drop-art-col">
                <Link
                  href={`/drops/${props.drop.slug}`}
                  className="store-drop-art-frame group"
                  aria-label={`Explore ${props.drop.name} collection`}
                >
                  <div className="store-drop-art-inner">
                    <Media
                      src={props.drop.teaserImage}
                      alt={`${props.drop.name} collection artwork`}
                      ratio="2610 / 2115"
                      fit="cover"
                      className="!bg-transparent"
                      sizes="(min-width: 1024px) 480px, (min-width: 768px) 400px, 90vw"
                      priority
                    />
                  </div>
                  <div className="store-drop-art-inspect">
                    <span>Explore drop</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </div>
                </Link>
              </div>

              <div className="store-drop-content-col">
                <div className="store-drop-header-badge">
                  <span className="store-drop-pulse-indicator" aria-hidden="true">
                    <span className="store-drop-pulse-ring" />
                    <span className="store-drop-pulse-core" />
                  </span>
                  <span className="store-drop-status-text">
                    {props.drop.state === 'LIVE' ? 'The Current Drop' : 'Coming Next'}
                  </span>
                  <span className="store-drop-badge-divider" aria-hidden="true">/</span>
                  <span className="store-drop-edition-text">Stimpie Collection</span>
                </div>

                <h2 id="home-drop-title" className="store-drop-title">
                  {props.drop.name}
                </h2>

                <RichText
                  text={props.drop.story.trim() || 'A new collection of Stimpies. Find the artwork that feels like you, then make it part of your everyday hoodie.'}
                  className="store-drop-desc"
                />

                {props.drop.state === 'LIVE' && props.drop.unitsRemaining !== null ? (
                  <div className="store-drop-scarcity">
                    <div className="store-drop-scarcity-head">
                      <div className="store-drop-scarcity-label">
                        <Zap size={15} className="store-drop-scarcity-icon" aria-hidden="true" />
                        <span className="store-drop-scarcity-val">
                          {props.drop.unitsRemaining} Stimpies remaining
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="store-drop-actions">
                  <Link href={`/drops/${props.drop.slug}`} className="store-drop-cta">
                    <span>Explore the drop</span>
                    <ArrowRight size={18} aria-hidden="true" className="store-drop-cta-arrow" />
                  </Link>
                  <div className="store-drop-perks">
                    <span className="store-drop-perk-item">
                      <span className="store-drop-perk-dot" /> Cash on delivery across Lebanon
                    </span>
                    <span className="store-drop-perk-item">
                      <span className="store-drop-perk-dot" /> Made for the Stimpy hoodie
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    ) : null}
    <section className="store-section store-sets" id="packs" aria-labelledby="sets-title"><div className="container">
      <header className="store-section-heading"><div><p className="store-eyebrow">Your starting point</p><h2 id="sets-title">One hoodie. Your kind of set.</h2><p>The essential layer, with room to make it yours.</p></div></header>
      {props.packs.length ? <div className="store-pack-grid">
        {props.packCards ?? props.packs.map((pack) => <PackTile key={pack.id} pack={pack} hoodieSlug={props.hoodieSlug} extraCents={pack.stimpieCount === 2 ? props.extraCents : undefined} />)}
      </div> : <Link href="/shop" className="store-button">Shop the hoodie <ArrowRight size={18} aria-hidden="true" /></Link>}
      {props.minExtra !== null ? <div className="store-extra-line"><div className="flex items-center gap-3"><Layers size={22} strokeWidth={1.5} aria-hidden="true" /><p>Already have the hoodie? <span className="text-fg-muted">A new back changes everything.</span></p></div>
        <Link href="/shop?tab=stimpies" className="store-text-link">Stimpies from {formatCents(props.minExtra)} <ArrowRight size={17} aria-hidden="true" /></Link></div> : null}
    </div></section>
  </>;
}

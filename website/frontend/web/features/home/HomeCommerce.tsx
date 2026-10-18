import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button, Media, formatCents } from '@stimpy/ui';
import type { Drop, Pack, Stimpie } from '@stimpy/api-client';
import { ArrowRight, Layers, Shirt } from '@/components/icons';

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
      <p className="store-pack-price">{formatCents(pack.priceCents)}</p>
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
            <div><img src={stimpie.images[0] ?? stimpie.artworkUrl ?? undefined} alt={`${stimpie.name} Stimpie`} loading="lazy" decoding="async" className="aspect-[0.64] w-full object-contain" /></div>
            <div className="absolute flex gap-1"><span>Core</span></div>
            <div className="flex flex-1 flex-col"><h3 className="text-h4"><Link href={`/shop/stimpie/${stimpie.slug}`} className="after:absolute after:inset-0">{stimpie.name}</Link></h3><p className="text-price-sm">{formatCents(stimpie.priceCents)}</p></div>
          </article>
        </li>)}
      </ul>
    </div></section> : null}
    {props.drop ? <section className="store-drop-band" aria-labelledby="home-drop-title"><div className="container store-drop-inner">
      <div className="store-drop-art"><Media src={props.drop.teaserImage} alt={`${props.drop.name} collection artwork`} ratio="4 / 5" fit="contain" sizes="(min-width: 768px) 360px, 80vw" /></div>
      <div className="store-drop-copy"><p className="store-eyebrow"><span className="store-brand-mark" aria-hidden="true" /> {props.drop.state === 'LIVE' ? 'The current drop' : 'Coming next'}</p>
        <h2 id="home-drop-title">{props.drop.name}</h2><p>Limited-run Stimpies. A new perspective for the hoodie you already love.</p>
        {props.drop.state === 'LIVE' && props.drop.unitsRemaining !== null ? <p className="store-drop-availability">{props.drop.unitsRemaining} Stimpies remaining</p> : null}
        <Link href={`/drops/${props.drop.slug}`} className="store-button">Explore the drop <ArrowRight size={18} aria-hidden="true" /></Link>
      </div>
    </div></section> : null}
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

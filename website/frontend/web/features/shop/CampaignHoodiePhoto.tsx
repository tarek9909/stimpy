import { campaignImages } from '@/lib/campaign-images';

// Traced from the 809px campaign crop; the inner cutout leaves its printed panel unchanged.
const GARMENT = [
  'M419 30  L434 30  L524 48  L550 56  L562 62  L570 70  L573 81  L574 95',
  'L585 127  L589 133  L589 143  L585 149  L589 149  L588 152  L590 151  L590 153',
  'L632 172  L652 186  L674 208  L697 240  L703 244  L703 247  L710 261  L715 267',
  'L760 361  L765 376  L770 384  L784 418  L799 460  L809 511  L808 549  L805 572',
  'L796 613  L779 660  L764 687  L761 690  L755 691  L750 696  L729 733  L725 733',
  'L713 727  L702 725  L701 723  L693 723  L689 721  L674 720  L662 724  L659 722',
  'L654 732  L649 757  L644 770  L644 775  L642 776  L620 773  L580 764  L518 756',
  'L420 752  L316 757  L254 765  L221 773  L206 774  L204 771  L195 726  L191 717',
  'L178 717  L172 720  L159 722  L152 726  L141 727  L131 732  L125 731  L122 722',
  'L115 713  L108 698  L100 690  L94 689  L89 684  L88 679  L81 669  L72 650',
  'L63 624  L51 572  L46 532  L46 505  L52 469  L64 430  L91 365  L129 288',
  'L131 287  L138 271  L153 247  L154 242  L159 239  L159 237  L163 234  L179 212',
  'L185 207  L185 205  L212 180  L239 164  L272 151  L265 141  L265 134  L271 125',
  'L272 119  L283 95  L288 73  L296 63  L310 55  L332 48  Z  M283 210',
  'H570 V657 H283 Z',
].join(' ');

/** Campaign photograph for the bundled catalog, with a colour preview matching the Builder. */
export function CampaignHoodiePhoto() {
  const image = campaignImages.builder;
  const sizes = '(min-width: 768px) min(50vw, 580px), min(100vw, 440px)';
  return (
    <>
      <picture>
        <source type="image/avif" srcSet={image.avifSrcSet} sizes={sizes} />
        <img src={image.src} srcSet={image.webpSrcSet} sizes={sizes} alt="" aria-hidden="true"
          width={image.width} height={image.height} fetchPriority="high" decoding="async"
          className="absolute inset-0 h-full w-full object-contain" />
      </picture>
      <svg aria-hidden="true" viewBox="0 0 809 809" preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ mixBlendMode: 'screen', opacity: 0.82 }}>
        <path d={GARMENT} fill="var(--hoodie-preview-color)" fillRule="evenodd" />
      </svg>
    </>
  );
}

export function isSeedHoodiePhoto(url: string | null): boolean {
  if (!url) return false;
  try {
    return /^\/uploads\/seed\/hoodies\/photo-(front|back)-(black|cream|stone|coral)-[a-f0-9]+\.webp$/
      .test(new URL(url, 'http://localhost').pathname);
  } catch {
    return false;
  }
}

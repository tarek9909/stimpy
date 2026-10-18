import Link from 'next/link';
import { Media, RichText } from '@stimpy/ui';
import type { Content } from '@stimpy/api-client';
import { ArrowRight, Layers, RefreshCw, Shirt } from '@/components/icons';
import { isVideoUrl } from '@/lib/media';
import { LoopVideo } from '@/components/LoopVideo';

const DEFAULT_STEPS = [
  { title: 'Start with the hoodie', text: 'A heavyweight essential. Made to be worn your way.', mediaUrl: null, Icon: Shirt },
  { title: 'Find your Stimpie', text: 'Original back panels with a personality of their own.', mediaUrl: null, Icon: Layers },
  { title: 'Change your perspective', text: 'Zip off. Zip on. A new look, without a new hoodie.', mediaUrl: null, Icon: RefreshCw },
] as const;

/** Preview the first three authored steps; the full guide remains linked for longer lists. */
export function HomeHowItWorks({ steps }: { steps: Content['howItWorks']['steps'] }) {
  const shown = steps.length > 0 ? steps.slice(0, 3) : DEFAULT_STEPS;
  return <section className="store-how-band" aria-labelledby="how-title"><div className="container">
    <header className="store-section-heading"><div><p className="store-eyebrow">Less wardrobe. More you.</p><h2 id="how-title">Same hoodie. Different energy.</h2></div>
      <Link href="/how-it-works" className="store-text-link">How it works <ArrowRight size={17} aria-hidden="true" /></Link></header>
    <ol className="store-steps">{shown.map((step, i) => {
      const Icon = DEFAULT_STEPS[i]?.Icon ?? Shirt;
      return <li key={`${i}-${step.title}`}>
        {step.mediaUrl ? isVideoUrl(step.mediaUrl)
          ? <LoopVideo src={step.mediaUrl} ratio="4 / 3" label={step.title} className="mb-5 rounded-lg" />
          : <Media src={step.mediaUrl} alt={step.title} ratio="4 / 3" sizes="(min-width: 768px) 30vw, 100vw" className="mb-5 rounded-lg" /> : null}
        <div className="store-step-top"><Icon size={28} strokeWidth={1.5} aria-hidden="true" /><span>0{i + 1}</span></div>
        <h3>{step.title}</h3><RichText text={step.text} />
      </li>;
    })}</ol>
  </div></section>;
}

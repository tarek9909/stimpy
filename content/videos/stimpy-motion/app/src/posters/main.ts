// Entry for posters.html: previews every Instagram post; scripts/posters.ts drives it to export PNGs.
import { Engine } from '../engine/engine';
import { cacheDesigns } from '../art/designs';
import { POSTERS, PW, PH } from './posters';

declare global { interface Window { __posters: any } }

/** Render a post supersampled ×SS, then downsample to the delivery size (cleaner edges and type). */
function render(id: string, SS = 2) {
  const p = POSTERS.find((q) => q.id === id);
  if (!p) throw new Error(`no post ${id}`);
  const big = document.createElement('canvas');
  big.width = PW * SS; big.height = PH * SS;
  const c = big.getContext('2d')!;
  c.scale(SS, SS);
  p.draw(c);
  const out = document.createElement('canvas');
  out.width = PW; out.height = PH;
  const o = out.getContext('2d')!;
  o.imageSmoothingQuality = 'high';
  o.drawImage(big, 0, 0, PW, PH);
  return out;
}

async function boot() {
  await Engine.loadAssets();
  await cacheDesigns();
  const grid = document.getElementById('grid')!;
  grid.textContent = '';
  for (const p of POSTERS) {
    const fig = document.createElement('figure');
    fig.appendChild(render(p.id));
    const cap = document.createElement('figcaption');
    cap.textContent = `${p.id} · ${p.title}`;
    fig.appendChild(cap);
    grid.appendChild(fig);
  }
  window.__posters = {
    ids: POSTERS.map((p) => p.id),
    png: (id: string) => render(id).toDataURL('image/png').split(',')[1],
    ready: true,
  };
}
boot().catch((e) => { document.body.textContent = String(e?.stack ?? e); (window as any).__postersError = String(e?.stack ?? e); });

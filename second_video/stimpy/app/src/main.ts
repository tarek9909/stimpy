// Entry: preview player (default) or export mode (?export=1, driven by scripts/render.ts).
import { Engine } from './engine/engine';
import { PW, PH, SCALE } from './engine/gl';
import { TIMELINE, DURATION } from './timeline';
import music from './music.json';

const params = new URLSearchParams(location.search);
const EXPORT = params.has('export');
const FROM = params.get('t') ? parseFloat(params.get('t')!) : null;

const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = PW;
canvas.height = PH;
const engine = new Engine(canvas);

declare global { interface Window { __stimpy: any } }

async function boot() {
  await engine.init(TIMELINE, DURATION);
  if (EXPORT) setupExport(); else setupPlayer();
}

function setupExport() {
  document.body.classList.add('export');
  window.__stimpy = {
    engine, duration: engine.duration, errors: engine.errors, scale: SCALE, width: PW, height: PH,
    timeline: TIMELINE.map(({ id, start, end }) => ({ id, start, end })),
    still(t: number, samples = 1, shutter = 0.5) { return engine.render(t, 1 / 60, samples, shutter); },
    /** Render [from, to) at fps and stream raw RGBA frames (bottom-up) over a WebSocket, with ack-based backpressure. */
    async stream(o: { from: number; to: number; fps: number; ws: string; samples?: number; shutter?: number; inflight?: number }) {
      const ws = new WebSocket(o.ws);
      ws.binaryType = 'arraybuffer';
      let acked = 0;
      ws.onmessage = (e) => { if (typeof e.data === 'string') acked = Math.max(acked, +e.data || 0); };
      await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = (e) => rej(e); });
      const dt = 1 / o.fps, n0 = Math.round(o.from * o.fps), n1 = Math.round(o.to * o.fps);
      const buf = new Uint8Array(PW * PH * 4);
      const inflight = o.inflight ?? 4;
      for (let n = n0; n < n1; n++) {
        engine.render(n * dt, dt, o.samples ?? 1, o.shutter ?? 0.5);
        engine.readPixels(buf);
        while (n - n0 - acked >= inflight) await new Promise((r) => setTimeout(r, 1));
        ws.send(buf);
      }
      while (ws.bufferedAmount > 0) await new Promise((r) => setTimeout(r, 5));
      ws.close();
    },
  };
  window.__stimpy.ready = true;
}

function setupPlayer() {
  const audio = new Audio('audio/stimpy.wav');
  audio.preload = 'auto';
  const ui = document.getElementById('ui')!;
  const scrub = document.getElementById('scrub') as HTMLInputElement;
  const info = document.getElementById('info')!;
  const marks = document.getElementById('marks')!;
  const errs = document.getElementById('errs')!;
  scrub.max = String(engine.duration);
  scrub.step = '0.001';
  for (const e of TIMELINE) {
    const m = document.createElement('div');
    m.className = 'mark';
    m.style.left = `${(e.start / engine.duration) * 100}%`;
    m.style.width = `${((e.end - e.start) / engine.duration) * 100}%`;
    m.textContent = e.id;
    m.onclick = () => seek(e.start);
    marks.appendChild(m);
  }
  let t = FROM ?? 0, playing = false, lastA = 0, lastP = 0;
  let loop: [number, number] | null = null;
  const seek = (x: number) => { t = Math.max(0, Math.min(engine.duration - 0.001, x)); audio.currentTime = t; };
  seek(t);
  const toggle = () => { playing = !playing; if (playing) { audio.currentTime = t; audio.play(); } else audio.pause(); };
  canvas.onclick = toggle;
  scrub.oninput = () => seek(parseFloat(scrub.value));
  window.addEventListener('keydown', (ev) => {
    if (ev.key === ' ') { ev.preventDefault(); toggle(); }
    if (ev.key === 'ArrowRight') seek(t + (ev.shiftKey ? 5 : 1));
    if (ev.key === 'ArrowLeft') seek(t - (ev.shiftKey ? 5 : 1));
    if (ev.key === '.') seek(t + 1 / 60);
    if (ev.key === ',') seek(t - 1 / 60);
    if (ev.key === 'h') ui.classList.toggle('hidden');
    if (ev.key === 'l') { const e = engine.sceneAt(t); loop = loop ? null : [e.start, e.end]; }
    if (ev.key === ']') { const e = TIMELINE.find((x) => x.start > t + 0.01); if (e) seek(e.start); }
    if (ev.key === '[') { const es = TIMELINE.filter((x) => x.start < t - 0.3); const e = es[es.length - 1]; if (e) seek(e.start); }
  });
  let frames = 0, fpsT = performance.now(), fps = 0;
  const tick = () => {
    if (playing) {
      const now = performance.now();
      if (audio.currentTime !== lastA) { lastA = audio.currentTime; lastP = now; }
      t = lastA + (audio.paused ? 0 : (now - lastP) / 1000);
      if (loop && t >= loop[1]) seek(loop[0]);
      if (audio.ended) playing = false;
    }
    engine.render(t);
    scrub.value = String(t);
    frames++;
    const now = performance.now();
    if (now - fpsT > 500) { fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; }
    info.textContent = `${t.toFixed(2)}s  bar ${(t / music.bar).toFixed(2)}  [${engine.sceneAt(t).id}]  ${fps.toFixed(0)}fps${loop ? '  LOOP' : ''}`;
    if (engine.errors.length) { errs.textContent = engine.errors.join('\n\n'); errs.style.display = 'block'; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f55;position:fixed;top:0;left:0">${String(e?.stack ?? e)}</pre>`);
  window.__stimpy = { error: String(e?.stack ?? e) };
});

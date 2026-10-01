// Entry: preview player (default) or export mode (?export=1, driven by scripts/render.ts).
// URL: ?film=logo&v=<variant>&t=<seconds>&scale=<1|2>
import { Engine, SAFE, W, H, type Film } from './engine/engine';
import { cacheDesigns } from './art/designs';
import { FILMS, findFilm } from './films';
import { toWav } from './audio/score';

const params = new URLSearchParams(location.search);
const EXPORT = params.has('export');
const SCALE = Math.max(1, Math.round(+(params.get('scale') ?? '1')));

const canvas = document.getElementById('c') as HTMLCanvasElement;
const engine = new Engine(canvas, SCALE);

declare global { interface Window { __stimpy: any } }

let film: Film;
let audio: AudioBuffer | null = null;

async function load(id: string, variant?: string) {
  const def = findFilm(id);
  const v = variant ?? def.variants?.[0]?.id ?? '';
  film = def.make(v);
  engine.setFilm(film);
  audio = await film.score().render();
  return { film, variant: v };
}

async function boot() {
  await Engine.loadAssets();
  cacheDesigns();
  document.getElementById('loading')!.remove();
  if (EXPORT) setupExport(); else await setupPlayer();
}

function setupExport() {
  document.body.classList.add('export');
  window.__stimpy = {
    films: FILMS.map((f) => ({ id: f.id, title: f.title, variants: (f.variants ?? []).map((v) => v.id) })),
    async load(id: string, variant?: string) {
      const r = await load(id, variant);
      return { id: r.film.id, variant: r.variant, duration: r.film.duration, title: r.film.title, marks: r.film.marks };
    },
    get errors() { return engine.errors; },
    width: engine.PW, height: engine.PH,
    still(t: number, samples = 1, shutter = 0.5) { return engine.render(t, 1 / 60, samples, shutter); },
    /** The soundtrack as base64 WAV. */
    wav() {
      const b = toWav(audio!);
      let s = '';
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      return btoa(s);
    },
    /** Render [from, to) at fps and stream raw RGBA frames (bottom-up) over a WebSocket, with ack backpressure. */
    async stream(o: { from: number; to: number; fps: number; ws: string; samples?: number; shutter?: number; inflight?: number }) {
      const ws = new WebSocket(o.ws);
      ws.binaryType = 'arraybuffer';
      let acked = 0;
      ws.onmessage = (e) => { if (typeof e.data === 'string') acked = Math.max(acked, +e.data || 0); };
      await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = (e) => rej(e); });
      const dt = 1 / o.fps, n0 = Math.round(o.from * o.fps), n1 = Math.round(o.to * o.fps);
      const buf = new Uint8Array(engine.PW * engine.PH * 4);
      const inflight = o.inflight ?? 4;
      for (let n = n0; n < n1; n++) {
        engine.render(n * dt, dt, o.samples ?? 1, o.shutter ?? 0.5);
        engine.readPixels(buf);
        while (n - n0 - acked >= inflight) await new Promise((r) => setTimeout(r, 1));
        ws.send(buf);
      }
      // done when the renderer has acknowledged every frame (bufferedAmount can lag for tens of seconds)
      const total = n1 - n0, deadline = performance.now() + 60000;
      while (acked < total && performance.now() < deadline) await new Promise((r) => setTimeout(r, 5));
      ws.close();
    },
  };
  window.__stimpy.ready = true;
}

async function setupPlayer() {
  const ui = document.getElementById('ui')!;
  const filmSel = document.getElementById('film') as HTMLSelectElement;
  const varSel = document.getElementById('variant') as HTMLSelectElement;
  const playBtn = document.getElementById('play') as HTMLButtonElement;
  const scrub = document.getElementById('scrub') as HTMLInputElement;
  const info = document.getElementById('info')!;
  const brief = document.getElementById('brief')!;
  const marks = document.getElementById('marks')!;
  const errs = document.getElementById('errs')!;
  const safe = document.getElementById('safe')!;

  for (const f of FILMS) filmSel.add(new Option(f.title, f.id));
  const ac = new AudioContext();
  let src: AudioBufferSourceNode | null = null;
  let t = 0, playing = false, startCtx = 0, startT = 0, muted = false;
  let loopSec: [number, number] | null = null;
  const gain = ac.createGain();
  gain.connect(ac.destination);

  const stopAudio = () => { if (src) { try { src.stop(); } catch { /* */ } src.disconnect(); src = null; } };
  const startAudio = () => {
    stopAudio();
    if (!audio) return;
    src = ac.createBufferSource();
    src.buffer = audio;
    src.connect(gain);
    startCtx = ac.currentTime + 0.03;
    startT = t;
    src.start(startCtx, t);
  };
  const seek = (x: number) => {
    t = Math.max(0, Math.min(film.duration - 1 / 60, x));
    if (playing) startAudio();
  };
  const setPlaying = (p: boolean) => {
    playing = p;
    playBtn.textContent = p ? '❚❚ pause' : '▶ play';
    if (p) { if (ac.state !== 'running') ac.resume(); if (t >= film.duration - 0.05) t = 0; startAudio(); } else stopAudio();
  };

  const select = async (id: string, v?: string, keepT = false) => {
    setPlaying(false);
    const def = findFilm(id);
    varSel.innerHTML = '';
    for (const x of def.variants ?? []) varSel.add(new Option(x.label, x.id));
    varSel.style.display = def.variants?.length ? '' : 'none';
    const r = await load(id, v);
    varSel.value = r.variant;
    filmSel.value = id;
    brief.textContent = def.brief;
    scrub.max = String(film.duration);
    scrub.step = '0.001';
    marks.innerHTML = '';
    for (const m of film.marks) {
      const d = document.createElement('div');
      d.className = 'mark';
      d.style.left = `${(m.t / film.duration) * 100}%`;
      d.textContent = m.label;
      d.onclick = () => seek(m.t);
      marks.appendChild(d);
    }
    loopSec = null;
    if (!keepT) t = 0;
    const u = new URL(location.href);
    u.searchParams.set('film', id);
    if (r.variant) u.searchParams.set('v', r.variant); else u.searchParams.delete('v');
    u.searchParams.delete('t');
    history.replaceState(null, '', u);
  };

  filmSel.onchange = () => select(filmSel.value);
  varSel.onchange = () => select(filmSel.value, varSel.value, true);
  playBtn.onclick = () => setPlaying(!playing);
  canvas.onclick = () => setPlaying(!playing);
  scrub.oninput = () => seek(parseFloat(scrub.value));
  document.getElementById('safeBtn')!.onclick = () => { safe.style.display = safe.style.display === 'block' ? 'none' : 'block'; };

  const markTimes = () => film.marks.map((m) => m.t);
  window.addEventListener('keydown', (ev) => {
    if (ev.target instanceof HTMLSelectElement) return;
    if (ev.key === ' ') { ev.preventDefault(); setPlaying(!playing); }
    else if (ev.key === 'ArrowRight') seek(t + (ev.shiftKey ? 5 : 1));
    else if (ev.key === 'ArrowLeft') seek(t - (ev.shiftKey ? 5 : 1));
    else if (ev.key === '.') seek(t + 1 / 60);
    else if (ev.key === ',') seek(t - 1 / 60);
    else if (ev.key === 'h') ui.classList.toggle('hidden');
    else if (ev.key === 's') safe.style.display = safe.style.display === 'block' ? 'none' : 'block';
    else if (ev.key === 'm') { muted = !muted; gain.gain.value = muted ? 0 : 1; }
    else if (ev.key === ']') { const m = markTimes().find((x) => x > t + 0.01); if (m !== undefined) seek(m); }
    else if (ev.key === '[') { const ms = markTimes().filter((x) => x < t - 0.3); if (ms.length) seek(ms[ms.length - 1]!); }
    else if (ev.key === 'l') {
      if (loopSec) loopSec = null;
      else { const ms = markTimes(); const a = [...ms].reverse().find((x) => x <= t) ?? 0; const b = ms.find((x) => x > t) ?? film.duration; loopSec = [a, b]; }
    }
  });

  const placeSafe = () => {
    const r = canvas.getBoundingClientRect();
    const k = r.height / H;
    Object.assign(safe.style, {
      left: `${r.left + SAFE.left * k}px`, top: `${r.top + SAFE.top * k}px`,
      width: `${(SAFE.right - SAFE.left) * k}px`, height: `${(SAFE.bottom - SAFE.top) * k}px`,
      border: '1px dashed rgba(0,255,160,.7)',
    });
    void W;
  };

  await select(params.get('film') ?? FILMS[0]!.id, params.get('v') ?? undefined);
  if (params.get('t')) t = parseFloat(params.get('t')!);

  let frames = 0, fpsT = performance.now(), fps = 0;
  const tick = () => {
    if (playing) {
      t = startT + (ac.currentTime - startCtx);
      if (loopSec && t >= loopSec[1]) { t = loopSec[0]; startAudio(); }
      if (t >= film.duration) {
        if (film.loop) { t = 0; startAudio(); } else { t = film.duration - 1 / 60; setPlaying(false); }
      }
    }
    engine.render(Math.max(0, t));
    scrub.value = String(t);
    placeSafe();
    frames++;
    const now = performance.now();
    if (now - fpsT > 500) { fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; }
    info.textContent = `${Math.max(0, t).toFixed(2)} / ${film.duration.toFixed(2)}s  ${fps.toFixed(0)}fps${loopSec ? '  LOOP' : ''}${muted ? '  MUTED' : ''}`;
    if (engine.errors.length) { errs.textContent = engine.errors.join('\n\n'); errs.style.display = 'block'; } else errs.style.display = 'none';
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f55;position:fixed;top:0;left:0;z-index:10">${String(e?.stack ?? e)}</pre>`);
  window.__stimpy = { error: String(e?.stack ?? e) };
});

// Preview + render entry. The frame is a pure function of song time.
import { drawFrame } from './scene';
import { PostFX } from './post';
import { DURATION, SONG, sectionAt } from './song';
import { CARDS, cardCanvas, loadStimpies } from './cards';
import { W, H } from './worlds';
import { avatar } from './avatar';

const FONTS: [string, string][] = [
  ['ArchivoX', 'Archivo-w1250-900.ttf'],
  ['Archivo7', 'Archivo-w1000-700.ttf'],
  ['Corm', 'Cormorant-600.ttf'],
  ['CormI', 'CormorantItalic-400.ttf'],
  ['Plex', 'IBMPlexMono-Regular.ttf'],
  ['PlexB', 'IBMPlexMono-SemiBold.ttf'],
];

const params = new URLSearchParams(location.search);
const RENDER = params.has('render');

const frameCanvas = document.createElement('canvas');
frameCanvas.width = W;
frameCanvas.height = H;
const ctx = frameCanvas.getContext('2d')!;
const out = document.getElementById('out') as HTMLCanvasElement;
const post = new PostFX(out, W, H);

function render(t: number) {
  const p = drawFrame(ctx, t);
  post.render(frameCanvas, p, Math.floor(t * 24)); // film grain changes 24x a second, like film
}

// accumulate sub-frames for motion blur (export only)
const acc = document.createElement('canvas');
acc.width = W;
acc.height = H;
const actx = acc.getContext('2d')!;
function renderBlurred(t: number, fps: number, samples: number, shutter: number) {
  if (samples <= 1) {
    render(t);
    return out;
  }
  for (let i = 0; i < samples; i++) {
    const st = t + ((i + 0.5) / samples - 0.5) * (shutter / fps);
    render(Math.max(0, st));
    actx.globalAlpha = 1 / (i + 1);
    actx.drawImage(out, 0, 0);
  }
  actx.globalAlpha = 1;
  return acc;
}

async function boot() {
  await Promise.all(
    FONTS.map(async ([name, file]) => {
      const f = new FontFace(name, `url(fonts/${file})`, { weight: '100 900' });
      await f.load();
      document.fonts.add(f);
    }),
  );
  await loadStimpies();
  CARDS.forEach((c) => cardCanvas(c.n));
  if (params.has('avatar')) {
    // 3D avatar is opt-in: ?avatar
    avatar.partsFrom = 'models/CasualCharacter.glb';
    await avatar.load('models/HoodieCharacter.glb');
  }
  (window as any).__avatar = avatar;

  (window as any).__stimpy = {
    ready: true,
    duration: DURATION,
    frame(t: number, fps = 30, samples = 1, shutter = 0.5, quality = 0.95) {
      const cv = renderBlurred(t, fps, samples, shutter);
      return cv.toDataURL('image/jpeg', quality);
    },
    still(t: number) {
      render(t);
      return out.toDataURL('image/png');
    },
    card(n: number, scale = 4) {
      return cardCanvas(n, scale).toDataURL('image/png');
    },
    lookbook() {
      const cols = 6, cw = 400, ch = 625, g = 30;
      const lb = document.createElement('canvas');
      lb.width = cols * (cw + g) + g;
      lb.height = 3 * (ch + g) + g + 120;
      const s = lb.getContext('2d')!;
      s.fillStyle = '#050505';
      s.fillRect(0, 0, lb.width, lb.height);
      s.fillStyle = '#ece6da';
      s.font = '900 64px ArchivoX';
      s.fillText('STIMPY — DROP 001 — THE STIMPIES', g, 90);
      const order = [...CARDS.slice(1).map((c) => c.n), 0];
      order.forEach((n, i) => s.drawImage(cardCanvas(n, 1), g + (i % cols) * (cw + g), 120 + g + Math.floor(i / cols) * (ch + g), cw, ch));
      return lb.toDataURL('image/jpeg', 0.92);
    },
    sheet(times: number[], cols: number, cellW: number) {
      const cellH = Math.round((cellW * H) / W);
      const rows = Math.ceil(times.length / cols);
      const sh = document.createElement('canvas');
      sh.width = cols * cellW;
      sh.height = rows * (cellH + 28);
      const s = sh.getContext('2d')!;
      s.fillStyle = '#222';
      s.fillRect(0, 0, sh.width, sh.height);
      times.forEach((t, i) => {
        render(t);
        const x = (i % cols) * cellW, y = Math.floor(i / cols) * (cellH + 28);
        s.drawImage(out, x, y, cellW - 4, cellH);
        s.fillStyle = '#fff';
        s.font = '18px monospace';
        s.fillText(`${t.toFixed(2)}s ${sectionAt(t).name}`, x + 6, y + cellH + 20);
      });
      return sh.toDataURL('image/jpeg', 0.9);
    },
  };
  if (RENDER) return;
  preview();
}

function preview() {
  const fit = () => {
    const r = out.getBoundingClientRect();
    post.setOutput(r.width * devicePixelRatio, r.height * devicePixelRatio);
  };
  addEventListener('resize', fit);
  fit();
  const audio = new Audio('stimpy.wav');
  const ui = document.getElementById('ui')!;
  let playing = false;
  let t = Number(params.get('t') ?? 0);
  audio.currentTime = t;
  const fps = 1 / 60;
  const setPlay = (p: boolean) => {
    playing = p;
    if (p) {
      audio.currentTime = t;
      audio.play();
    } else audio.pause();
  };
  const seek = (nt: number) => {
    t = Math.min(DURATION, Math.max(0, nt));
    audio.currentTime = t;
  };
  addEventListener('keydown', (e) => {
    if (e.key === ' ') setPlay(!playing);
    else if (e.key === 'ArrowRight') seek(t + (e.shiftKey ? 5 : 1));
    else if (e.key === 'ArrowLeft') seek(t - (e.shiftKey ? 5 : 1));
    else if (e.key === '.') seek(t + fps);
    else if (e.key === ',') seek(t - fps);
    else if (e.key === ']' || e.key === '[') {
      const secs = SONG.sections;
      const i = secs.indexOf(sectionAt(t));
      const j = Math.max(0, Math.min(secs.length - 1, i + (e.key === ']' ? 1 : -1)));
      seek(e.key === '[' && t - secs[i].start > 0.5 ? secs[i].start : secs[j].start);
    } else if (e.key === 'h') ui.style.display = ui.style.display === 'none' ? '' : 'none';
    else return;
    e.preventDefault();
  });
  out.addEventListener('click', () => setPlay(!playing));
  audio.addEventListener('ended', () => (playing = false));
  const loop = () => {
    if (playing) t = audio.currentTime;
    render(t);
    ui.textContent = `${t.toFixed(2)}s  ${sectionAt(t).name}  ${playing ? '▶' : '❚❚'}   space play · ←/→ seek · [ ] section · , . frame · h hide`;
    requestAnimationFrame(loop);
  };
  loop();
}

boot();

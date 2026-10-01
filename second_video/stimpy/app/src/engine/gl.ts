// Output geometry: a vertical 9:16 Reel. Scenes lay out in 1080×1920 logical px; ?scale=2 renders a
// true 2160×3840 frame. Reels UI covers roughly the top 250 px and the bottom 400 px: key text stays
// between SAFE.top and SAFE.bottom.
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const SCALE = Math.max(1, Math.round(+(params.get('scale') ?? '1')));
export const W = 1080;
export const H = 1920;
export const PW = W * SCALE;
export const PH = H * SCALE;
export const SAFE = { top: 260, bottom: H - 420, left: 80, right: W - 80 };
/** Vertical field of view of the 3D camera; at DIST a world unit is one logical pixel on the z = 0 plane. */
export const FOV = 30;
export const DIST = H / 2 / Math.tan((FOV / 2) * (Math.PI / 180));

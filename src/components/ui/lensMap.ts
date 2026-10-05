// Displacement map for a convex glass slab: the centre stays clear and only the
// bezel refracts, sampling the backdrop from further inside like a real lens edge.
// Channels follow feDisplacementMap: R = x offset, B = y offset, 128 = none.
const cache = new Map<string, string>();
const MAX_SIDE = 320;
const NEUTRAL = 0xff808080;

export function lensBezel(width: number, height: number): number {
  return Math.max(4, Math.min(28, Math.min(width, height) * 0.24));
}

export function lensMap(width: number, height: number, radius: number, bezel = lensBezel(width, height)): string {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  const key = `${w}x${h}:${Math.round(radius)}:${Math.round(bezel)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cw = Math.max(2, Math.round(w * scale));
  const ch = Math.max(2, Math.round(h * scale));
  const hx = cw / 2;
  const hy = ch / 2;
  const r = Math.min(radius * scale, hx, hy);
  const depthMax = Math.max(1, Math.min(bezel * scale, hx, hy));
  const band = Math.ceil(Math.max(depthMax, r)) + 1;

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const image = context.createImageData(cw, ch);
  const pixels = new Uint32Array(image.data.buffer);
  pixels.fill(NEUTRAL);

  for (let y = 0; y < ch; y++) {
    const py = y + 0.5 - hy;
    const edgeRow = y < band || y >= ch - band;
    for (let x = 0; x < cw; x++) {
      // Rows away from the top and bottom only need their left and right bands.
      if (!edgeRow && x === band && cw - band > band) x = cw - band;
      const px = x + 0.5 - hx;
      const qx = Math.abs(px) - (hx - r);
      const qy = Math.abs(py) - (hy - r);
      let nx = 0;
      let ny = 0;
      let depth: number;
      if (qx > 0 && qy > 0) {
        const length = Math.hypot(qx, qy);
        depth = r - length;
        nx = (qx / length) * Math.sign(px);
        ny = (qy / length) * Math.sign(py);
      } else if (qx > qy) {
        depth = r - qx;
        nx = Math.sign(px);
      } else {
        depth = r - qy;
        ny = Math.sign(py);
      }
      if (depth >= depthMax) continue;
      // Convex profile: steepest at the rim, flattening smoothly into the clear centre.
      const falloff = 1 - Math.max(0, depth) / depthMax;
      const strength = falloff * falloff;
      const red = Math.round(128 - 127 * nx * strength);
      const blue = Math.round(128 - 127 * ny * strength);
      pixels[y * cw + x] = (0xff000000 | (blue << 16) | (128 << 8) | red) >>> 0;
    }
  }

  context.putImageData(image, 0, 0);
  const url = canvas.toDataURL("image/png");
  if (cache.size > 48) cache.delete(cache.keys().next().value!);
  cache.set(key, url);
  return url;
}

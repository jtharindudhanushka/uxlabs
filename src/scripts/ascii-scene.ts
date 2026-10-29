// Renders an image that "compiles" out of ASCII: it starts as code characters,
// dissolves into the real image, and the pointer turns a trail around it back
// into code. Only redraws while something is changing.

const RAMP = ' .,:;i1tfLCG08@';
const GLYPHS = '{}<>/=+;:01#*%&$';

interface Cell {
  x: number;
  y: number;
  lum: number;
  alpha: number;
  color: string;
  t: number; // 1 = ascii, 0 = image
  hold: number; // intro: seconds to stay ascii before dissolving
  ch: string;
}

export interface AsciiScene {
  start(): void;
  destroy(): void;
}

export async function createAsciiScene(canvas: HTMLCanvasElement, src: string, opts: { cell?: number; lens?: number } = {}): Promise<AsciiScene | null> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  try {
    await img.decode();
  } catch {
    return null;
  }

  const cellW = opts.cell ?? 9;
  const cellH = Math.round(cellW * 1.25);
  const lens = opts.lens ?? 120;
  let cells: Cell[] = [];
  let cols = 0;
  let rows = 0;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let raf = 0;
  let last = 0;
  let started = false;
  let introDone = false;
  let pointer: { x: number; y: number } | null = null;

  const pick = (lum: number) => {
    // Bright cells read as dense code glyphs, dim ones as the luminance ramp
    if (lum > 0.55 && Math.random() < 0.5) return GLYPHS[(Math.random() * GLYPHS.length) | 0];
    return RAMP[Math.min(RAMP.length - 1, Math.round(lum * (RAMP.length - 1)))];
  };

  const layout = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const prevCols = cols;
    const prevRows = rows;
    cols = Math.ceil(w / cellW);
    rows = Math.ceil(h / cellH);
    const sample = document.createElement('canvas');
    sample.width = cols;
    sample.height = rows;
    const sctx = sample.getContext('2d', { willReadFrequently: true })!;
    sctx.drawImage(img, 0, 0, cols, rows);
    const data = sctx.getImageData(0, 0, cols, rows).data;

    // Keep each cell's progress when the grid is unchanged (resizes fire mid-intro)
    const prev = new Map<string, Cell>();
    if (prevCols === cols && prevRows === rows) cells.forEach((c) => prev.set(c.x + ':' + c.y, c));
    cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 4;
        const a = data[i + 3] / 255;
        if (a < 0.12) continue;
        const R = data[i], G = data[i + 1], B = data[i + 2];
        const lum = Math.min(1, ((0.2126 * R + 0.7152 * G + 0.0722 * B) / 255) * 1.6 + 0.08);
        // Tint toward lilac so the code reads on brand
        const tr = Math.round(R * 0.5 + 241 * 0.5);
        const tg = Math.round(G * 0.5 + 200 * 0.5);
        const tb = Math.round(B * 0.5 + 255 * 0.5);
        const old = prev.get(c * cellW + ':' + r * cellH);
        cells.push({
          x: c * cellW,
          y: r * cellH,
          lum,
          alpha: a,
          color: `rgb(${tr},${tg},${tb})`,
          t: old ? old.t : introDone ? 0 : 1,
          // dissolve from the bottom up, with a little noise
          hold: old ? old.hold : introDone ? 0 : 0.25 + (1 - r / rows) * 1.1 + Math.random() * 0.45,
          ch: pick(lum),
        });
      }
    }
    ctx.font = `${Math.round(cellH * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textBaseline = 'top';
    draw();
  };

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.drawImage(img, 0, 0, w, h);
    for (const c of cells) {
      if (c.t < 0.5) continue;
      ctx.clearRect(c.x, c.y, cellW, cellH);
      ctx.globalAlpha = c.alpha * (0.35 + c.lum * 0.65) * Math.min(1, c.t * 1.4);
      ctx.fillStyle = c.color;
      ctx.fillText(c.ch, c.x, c.y);
    }
    ctx.globalAlpha = 1;
  };

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    let active = false;
    for (const c of cells) {
      if (c.hold > 0) {
        c.hold -= dt;
        active = true;
      } else if (c.t > 0) {
        c.t = Math.max(0, c.t - dt * 1.8);
        active = true;
      }
      if (pointer) {
        const dx = c.x + cellW / 2 - pointer.x;
        const dy = c.y + cellH / 2 - pointer.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < lens) {
          const v = 1 - d / lens;
          if (v > c.t) c.t = Math.min(1, v * 1.6);
          active = true;
        }
      }
      if (c.t >= 0.5 && Math.random() < 0.12) c.ch = pick(c.lum);
    }
    pointer = null;
    if (!active && started) introDone = true;
    draw();
    raf = active ? requestAnimationFrame(frame) : 0;
  };

  const wake = () => {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };

  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (started) wake();
  };

  const ro = new ResizeObserver(() => layout());
  ro.observe(canvas);
  layout();

  return {
    start() {
      started = true;
      canvas.parentElement?.addEventListener('pointermove', onMove);
      wake();
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.parentElement?.removeEventListener('pointermove', onMove);
    },
  };
}

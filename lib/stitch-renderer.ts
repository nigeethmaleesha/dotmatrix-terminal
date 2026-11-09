/**
 * Browser-only portrait renderer.
 * Image bytes are used exactly as supplied by the user, with optional local filters.
 * The matrix mode recreates a progressive neon-green dot scan rather than stretching
 * pixels or replacing a real person with a generative face.
 */
export type Ink = "phosphor" | "graphite";
export type PortraitRenderMode = "matrix" | "original" | "pencil";

export interface DrawOptions {
  detail: number;           // 35..100
  contrast: number;         // .75..1.6
  invert: boolean;
  ink: Ink;
}

export interface RasterPortrait {
  canvas: HTMLCanvasElement;
  bounds: { x: number; y: number; width: number; height: number };
  stitch: { cellWidth: number; cellHeight: number; columns: number; rows: number };
}

// Landscape canvas matching the user's screen-recorded reference (16:9).
export type CanvasFormat = "landscape" | "portrait";
export interface SceneConfig { width: number; height: number; scale: number; format: CanvasFormat }
export const SCENES: Record<CanvasFormat, SceneConfig> = {
  landscape: { format: "landscape", width: 1152, height: 648, scale: 2 },
  // 720 × 1280 logical pixels at 1.5x -> native 1080 × 1920 recording.
  portrait: { format: "portrait", width: 720, height: 1280, scale: 1.5 },
};
export const SCENE_WIDTH = SCENES.landscape.width;
export const SCENE_HEIGHT = SCENES.landscape.height;
export const SCENE_BACKGROUND = "#080e0a";
const GREEN: [number, number, number] = [190, 255, 142];
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function inkRgb(ink: Ink): [number, number, number] {
  return ink === "phosphor" ? GREEN : [229, 236, 225];
}

export function splitGraphemes(value: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value), v => v.segment);
  }
  return Array.from(value);
}

function titleFont(size: number): string {
  return `750 ${size}px system-ui, "Noto Sans Sinhala", "Iskoola Pota", sans-serif`;
}

function fittedTitle(ctx: CanvasRenderingContext2D, name: string, scene: SceneConfig): { lines: string[]; size: number } {
  const available = scene.format === "portrait" ? scene.width - 76 : scene.width - 160;
  for (let size = (scene.format === "portrait" ? 70 : 82); size >= 30; size -= 2) {
    ctx.font = titleFont(size);
    if (ctx.measureText(name).width <= available) return { lines: [name], size };
  }
  const words = name.trim().split(/\s+/).filter(Boolean);
  let lines: string[];
  if (words.length > 1) {
    let best: [string, string] = [words[0], words.slice(1).join(" ")];
    let bestScore = Infinity;
    ctx.font = titleFont(52);
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" ");
      const b = words.slice(i).join(" ");
      const wa = ctx.measureText(a).width;
      const wb = ctx.measureText(b).width;
      const score = Math.max(wa, wb) + .3 * Math.abs(wa - wb);
      if (score < bestScore) { bestScore = score; best = [a, b]; }
    }
    lines = best;
  } else {
    const chars = splitGraphemes(name);
    const mid = Math.ceil(chars.length / 2);
    lines = [chars.slice(0, mid).join(""), chars.slice(mid).join("")];
  }
  for (let size = 64; size >= 25; size -= 2) {
    ctx.font = titleFont(size);
    if (lines.every(line => ctx.measureText(line).width <= available)) return { lines, size };
  }
  return { lines, size: 25 };
}

export function paintStage(ctx: CanvasRenderingContext2D, scene: SceneConfig = SCENES.landscape): void {
  ctx.fillStyle = SCENE_BACKGROUND;
  ctx.fillRect(0, 0, scene.width, scene.height);
  const centerY = scene.format === "portrait" ? 690 : 330;
  const glow = ctx.createRadialGradient(scene.width / 2, centerY, 65, scene.width / 2, centerY, scene.format === "portrait" ? 760 : 670);
  glow.addColorStop(0, "rgba(24,50,28,.13)");
  glow.addColorStop(1, "rgba(8,14,10,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, scene.width, scene.height);
  if (scene.format === "portrait") {
    // Subtle atmospheric rule and corners; no desktop interface gets into the video.
    ctx.strokeStyle = "rgba(178,255,142,.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(38, 135); ctx.lineTo(scene.width - 38, 135);
    ctx.moveTo(38, scene.height - 100); ctx.lineTo(scene.width - 38, scene.height - 100);
    ctx.stroke();
    ctx.font = '500 15px "Courier New", monospace';
    ctx.fillStyle = "rgba(190,255,160,.42)";
    ctx.textAlign = "center";
    ctx.fillText("DOTMATRIX   /   VISUAL STORY", scene.width / 2, scene.height - 63);
  }
}

export function paintTitle(ctx: CanvasRenderingContext2D, name: string, visibleGraphemes: number, showCaret: boolean, ink: Ink, scene: SceneConfig = SCENES.landscape): void {
  if (!name) return;
  const { lines, size } = fittedTitle(ctx, name, scene);
  const positions = scene.format === "portrait"
    ? (lines.length === 1 ? [265] : [214, 290])
    : (lines.length === 1 ? [110] : [78, 144]);
  let remaining = visibleGraphemes;
  let caret: {x: number; y: number} | null = null;
  ctx.save();
  ctx.font = titleFont(size);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.shadowColor = ink === "phosphor" ? "rgba(169,255,114,.20)" : "rgba(255,255,255,.10)";
  ctx.shadowBlur = 14;
  ctx.fillStyle = ink === "phosphor" ? "#c6ff95" : "#f0f2ed";
  for (let i = 0; i < lines.length; i++) {
    const chars = splitGraphemes(lines[i]);
    const left = (scene.width - ctx.measureText(lines[i]).width) / 2;
    const shown = Math.max(0, Math.min(chars.length, remaining));
    const part = chars.slice(0, shown).join("");
    ctx.fillText(part, left, positions[i]);
    if (remaining >= 0 && remaining <= chars.length) caret = {x: left + ctx.measureText(part).width + 8, y: positions[i]};
    remaining -= chars.length + (i < lines.length - 1 ? 1 : 0);
  }
  ctx.restore();
  if (showCaret && caret) {
    ctx.fillStyle = ink === "phosphor" ? "#beff83" : "#e5ede0";
    ctx.fillRect(caret.x, caret.y - size * .40, 4, size * .8);
  }
}

export function portraitBounds(image: HTMLImageElement, hasTitle: boolean, scene: SceneConfig = SCENES.landscape) {
  const tall = scene.format === "portrait";
  const maxWidth = tall ? scene.width - 48 : scene.width - 64;
  const maxHeight = tall ? (hasTitle ? 775 : 1070) : (hasTitle ? 422 : 570);
  const ratio = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = Math.max(2, Math.round(image.naturalWidth * ratio));
  const height = Math.max(2, Math.round(image.naturalHeight * ratio));
  const x = Math.round((scene.width - width) / 2);
  const yMin = tall ? (hasTitle ? 373 : 105) : (hasTitle ? 192 : 32);
  const areaHeight = tall ? (hasTitle ? 803 : 1090) : (hasTitle ? 438 : 584);
  const y = Math.round(yMin + (areaHeight - height) / 2);
  return {x, y, width, height};
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", {willReadFrequently: true});
  if (!ctx) throw new Error("Canvas 2D unavailable in this browser.");
  return {canvas, ctx};
}

function blur3x3(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const temp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[y * width + Math.max(0, Math.min(width - 1, k))];
    for (let x = 0; x < width; x++) {
      temp[y * width + x] = sum / (radius * 2 + 1);
      const left = Math.max(0, x - radius);
      const right = Math.min(width - 1, x + radius + 1);
      sum += src[y * width + right] - src[y * width + left];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += temp[Math.max(0, Math.min(height - 1, k)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / (radius * 2 + 1);
      const top = Math.max(0, y - radius);
      const bottom = Math.min(height - 1, y + radius + 1);
      sum += temp[bottom * width + x] - temp[top * width + x];
    }
  }
  return out;
}

function pencilSketch(ctx: CanvasRenderingContext2D, width: number, height: number, options: DrawOptions) {
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  const lum = new Float32Array(width * height);
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
    lum[p] = d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722;
  }
  const inverse = new Float32Array(lum.length);
  for (let i = 0; i < inverse.length; i++) inverse[i] = 255 - lum[i];
  const radius = Math.max(2, Math.round(8 - options.detail * .05));
  const blurredInverse = blur3x3(inverse, width, height, radius);
  const [r,g,b] = inkRgb(options.ink);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x;
    const pLeft = y * width + Math.max(0,x-1);
    const pRight = y * width + Math.min(width-1,x+1);
    const pTop = Math.max(0,y-1) * width + x;
    const pBottom = Math.min(height-1,y+1) * width + x;
    const edge = Math.min(1, Math.hypot(lum[pRight]-lum[pLeft], lum[pBottom]-lum[pTop]) / 130);
    const dodge = Math.min(255, lum[p] * 255 / Math.max(5, 255-blurredInverse[p]));
    // Preserve midtones and fine facial features instead of overexposing the face.
    let shade = clamp(((.58 * dodge + .42 * lum[p]) - edge * 42) / 255);
    shade = clamp((shade - .5) * options.contrast + .5);
    if (options.invert) shade = 1-shade;
    const i = p * 4;
    if (options.ink === "phosphor") {
      d[i] = r * shade; d[i+1] = g * shade; d[i+2] = b * shade;
    } else {
      const v = shade * 255;
      d[i] = v; d[i+1] = v; d[i+2] = v;
    }
    d[i+3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

const BAYER = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

/** Green halftone from ORIGINAL pixels, using an ImageData buffer for speed.
 * Keeps actual face/eyes and clothing shading instead of replacing the subject.
 */
function matrixDots(ctx: CanvasRenderingContext2D, width: number, height: number, options: DrawOptions): void {
  const src = ctx.getImageData(0, 0, width, height).data;
  const output = ctx.createImageData(width,height);
  const dst = output.data;
  const pixels = width * height;
  for (let p=0, i=0; p<pixels; p++,i+=4) {
    dst[i] = 8; dst[i+1] = 14; dst[i+2] = 10; dst[i+3] = 255;
  }
  const step = options.detail >= 85 ? 2 : options.detail >= 65 ? 3 : 4;
  for (let y=0, row=0; y<height; y+=step, row++) {
    const sy = Math.min(height-1, y);
    for (let x=0,col=0; x<width; x+=step,col++) {
      const sx = Math.min(width-1,x);
      const i=(sy*width+sx)*4;
      const lum=(src[i]*.2126+src[i+1]*.7152+src[i+2]*.0722)/255;
      // Shadow lift keeps distinguishing facial features visible, as in the video.
      const tone=clamp((lum-.5)*options.contrast+.52);
      const ordered = BAYER[(row%4)*4+(col%4)]/16;
      const shade=clamp(Math.pow(tone,.79) * (0.92 + (ordered-.5)*.11));
      if (shade < .095) continue;
      const r=Math.round(8+(GREEN[0]-8)*shade);
      const g=Math.round(14+(GREEN[1]-14)*shade);
      const b=Math.round(10+(GREEN[2]-10)*shade);
      const dotWidth = shade > .82 && step >=3 ? 2 : 1;
      for(let dy=0;dy<dotWidth;dy++) for(let dx=0;dx<dotWidth;dx++) {
        const px=x+dx, py=y+dy;
        if (px>=width || py>=height) continue;
        const di=(py*width+px)*4;
        dst[di]=r;dst[di+1]=g;dst[di+2]=b;
      }
    }
  }
  ctx.putImageData(output,0,0);
}

export function buildRasterPortrait(image: HTMLImageElement, title: string, options: DrawOptions, mode: PortraitRenderMode, scene: SceneConfig = SCENES.landscape): RasterPortrait {
  const bounds = portraitBounds(image, Boolean(title), scene);
  const {width,height} = bounds;
  const {canvas,ctx} = makeCanvas(width,height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);

  let cellWidth = 2;
  let cellHeight = 2;
  if (mode === "matrix") {
    matrixDots(ctx,width,height,options);
    cellWidth = options.detail >= 85 ? 2 : options.detail >= 65 ? 3 : 4;
    cellHeight = cellWidth;
  } else if (mode === "pencil") {
    pencilSketch(ctx,width,height,options);
    cellWidth = 2;
    cellHeight = 2;
  } else {
    cellWidth = 2;
    cellHeight = 2;
  }
  const columns = Math.ceil(width / cellWidth);
  const rows = Math.ceil(height / cellHeight);
  return {canvas,bounds, stitch: { cellWidth, cellHeight, columns, rows }};
}

/** Reveal the image stitch-by-stitch: left to right across a row, then next row. */
export function drawRasterReveal(ctx: CanvasRenderingContext2D, portrait: RasterPortrait, previousFraction: number, currentFraction: number): void {
  const {x,y,width,height} = portrait.bounds;
  const { cellWidth, cellHeight, columns, rows } = portrait.stitch;
  const totalCells = columns * rows;
  const fromCell = Math.max(0, Math.min(totalCells, Math.floor(totalCells * clamp(previousFraction))));
  const toCell = Math.max(0, Math.min(totalCells, Math.floor(totalCells * clamp(currentFraction))));
  if (toCell <= fromCell) return;

  for (let index = fromCell; index < toCell; index++) {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const sx = col * cellWidth;
    const sy = row * cellHeight;
    const sw = Math.min(cellWidth, width - sx);
    const sh = Math.min(cellHeight, height - sy);
    if (sw <= 0 || sh <= 0) continue;
    ctx.drawImage(portrait.canvas, sx, sy, sw, sh, x + sx, y + sy, sw, sh);
  }
}

/** Needle/head follows the active stitch position. */
export function drawRevealNeedle(ctx: CanvasRenderingContext2D, portrait: RasterPortrait, fraction: number, ink: Ink): void {
  const f = clamp(fraction);
  if (f <= 0 || f >= 1) return;
  const {x,y,width,height} = portrait.bounds;
  const { cellWidth, cellHeight, columns, rows } = portrait.stitch;
  const totalCells = columns * rows;
  const current = Math.max(0, Math.min(totalCells - 1, Math.floor(totalCells * f)));
  const row = Math.floor(current / columns);
  const col = current % columns;
  const headX = x + col * cellWidth + cellWidth / 2;
  const headY = y + row * cellHeight + cellHeight / 2;
  const [r,g,b] = inkRgb(ink);
  ctx.save();

  // tiny stitches already being laid immediately behind the head on the same row
  const trail = Math.min(14, col + 1);
  for (let i = 0; i < trail; i++) {
    const px = headX - i * cellWidth;
    const alpha = 0.08 + (trail - i) / trail * 0.16;
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
    ctx.fillRect(px, headY, Math.max(1, cellWidth - 1), 1);
  }

  // sewing needle/head
  ctx.shadowColor = `rgba(${r},${g},${b},.55)`;
  ctx.shadowBlur = 8;
  ctx.fillStyle = `rgba(${r},${g},${b},.92)`;
  ctx.beginPath();
  ctx.arc(headX, headY, Math.max(1.8, cellWidth * 0.8), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = `rgba(${r},${g},${b},.32)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(headX, Math.max(y - 10, headY - 10));
  ctx.lineTo(headX, headY + 8);
  ctx.stroke();

  // subtle current-row guide, not full reveal sweep
  ctx.strokeStyle = `rgba(${r},${g},${b},.10)`;
  ctx.beginPath();
  ctx.moveTo(x, headY);
  ctx.lineTo(x + width, headY);
  ctx.stroke();
  ctx.restore();
}

/**
 * Pure browser-side character art renderer. No image bytes leave the device.
 * Braille cells represent 2 x 4 source pixels; ASCII mode uses a luminance ramp.
 */
export type RenderMode = "braille" | "ascii";

export interface RenderOptions {
  mode: RenderMode;
  columns: number;
  contrast: number;
  inverted: boolean;
}

const BRAILLE_BITS = [
  [0, 0, 0x01], [0, 1, 0x02], [0, 2, 0x04], [1, 0, 0x08],
  [1, 1, 0x10], [1, 2, 0x20], [0, 3, 0x40], [1, 3, 0x80],
] as const;

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// Classic 5x7 bitmap characters: guarantees clean, readable dot-matrix lettering.
const FONT: Record<string, string[]> = {
  A: ["01110","10001","10001","11111","10001","10001","10001"],
  B: ["11110","10001","10001","11110","10001","10001","11110"],
  C: ["01111","10000","10000","10000","10000","10000","01111"],
  D: ["11110","10001","10001","10001","10001","10001","11110"],
  E: ["11111","10000","10000","11110","10000","10000","11111"],
  F: ["11111","10000","10000","11110","10000","10000","10000"],
  G: ["01111","10000","10000","10111","10001","10001","01111"],
  H: ["10001","10001","10001","11111","10001","10001","10001"],
  I: ["11111","00100","00100","00100","00100","00100","11111"],
  J: ["00111","00010","00010","00010","10010","10010","01100"],
  K: ["10001","10010","10100","11000","10100","10010","10001"],
  L: ["10000","10000","10000","10000","10000","10000","11111"],
  M: ["10001","11011","10101","10101","10001","10001","10001"],
  N: ["10001","11001","10101","10011","10001","10001","10001"],
  O: ["01110","10001","10001","10001","10001","10001","01110"],
  P: ["11110","10001","10001","11110","10000","10000","10000"],
  Q: ["01110","10001","10001","10001","10101","10010","01101"],
  R: ["11110","10001","10001","11110","10100","10010","10001"],
  S: ["01111","10000","10000","01110","00001","00001","11110"],
  T: ["11111","00100","00100","00100","00100","00100","00100"],
  U: ["10001","10001","10001","10001","10001","10001","01110"],
  V: ["10001","10001","10001","10001","10001","01010","00100"],
  W: ["10001","10001","10001","10101","10101","10101","01010"],
  X: ["10001","10001","01010","00100","01010","10001","10001"],
  Y: ["10001","10001","01010","00100","00100","00100","00100"],
  Z: ["11111","00001","00010","00100","01000","10000","11111"],
  0: ["01110","10011","10101","10101","11001","10001","01110"],
  1: ["00100","01100","00100","00100","00100","00100","01110"],
  2: ["01110","10001","00001","00010","00100","01000","11111"],
  3: ["11110","00001","00001","01110","00001","00001","11110"],
  4: ["00010","00110","01010","10010","11111","00010","00010"],
  5: ["11111","10000","10000","11110","00001","00001","11110"],
  6: ["01111","10000","10000","11110","10001","10001","01110"],
  7: ["11111","00001","00010","00100","01000","01000","01000"],
  8: ["01110","10001","10001","01110","10001","10001","01110"],
  9: ["01110","10001","10001","01111","00001","00001","11110"],
  " ": ["00000","00000","00000","00000","00000","00000","00000"],
  ".": ["00000","00000","00000","00000","00000","01100","01100"],
  ",": ["00000","00000","00000","00000","01100","01100","00100"],
  ":": ["00000","01100","01100","00000","01100","01100","00000"],
  "!": ["00100","00100","00100","00100","00100","00000","00100"],
  "?": ["01110","10001","00001","00010","00100","00000","00100"],
  "-": ["00000","00000","00000","11111","00000","00000","00000"],
  "_": ["00000","00000","00000","00000","00000","00000","11111"],
  "/": ["00001","00001","00010","00100","01000","10000","10000"],
  "\\": ["10000","10000","01000","00100","00010","00001","00001"],
  "+": ["00000","00100","00100","11111","00100","00100","00000"],
  "=": ["00000","11111","00000","11111","00000","00000","00000"],
  "#": ["01010","01010","11111","01010","11111","01010","01010"],
  "@": ["01110","10001","10111","10101","10111","10000","01110"],
  "&": ["01100","10010","10100","01000","10101","10010","01101"],
  "*": ["00000","10101","01110","11111","01110","10101","00000"],
  "'": ["00100","00100","00000","00000","00000","00000","00000"],
  '"': ["01010","01010","00000","00000","00000","00000","00000"],
  "(": ["00010","00100","01000","01000","01000","00100","00010"],
  ")": ["01000","00100","00010","00010","00010","00100","01000"],
  "[": ["01110","01000","01000","01000","01000","01000","01110"],
  "]": ["01110","00010","00010","00010","00010","00010","01110"],
  "<": ["00010","00100","01000","10000","01000","00100","00010"],
  ">": ["01000","00100","00010","00001","00010","00100","01000"],
  "%": ["11001","11010","00100","00100","01011","10011","00000"],
  "$": ["00100","01111","10100","01110","00101","11110","00100"],
  "|": ["00100","00100","00100","00100","00100","00100","00100"],
  "^": ["00100","01010","10001","00000","00000","00000","00000"],
  "~": ["00000","00000","01001","10101","10010","00000","00000"],
  ";": ["00000","01100","01100","00000","01100","01100","00100"],
};

function wrapText(text: string, maxCharacters = 17): string[] {
  const result: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph.trim()) {
      result.push("");
      continue;
    }
    const words = paragraph.trim().split(/\s+/);
    let line = "";
    for (const word of words) {
      if (line && line.length + word.length + 1 > maxCharacters) {
        result.push(line);
        line = "";
      }
      if (word.length > maxCharacters) {
        if (line) { result.push(line); line = ""; }
        for (let i = 0; i < word.length; i += maxCharacters) {
          const slice = word.slice(i, i + maxCharacters);
          if (slice.length === maxCharacters) result.push(slice);
          else line = slice;
        }
      } else {
        line += (line ? " " : "") + word;
      }
    }
    if (line) result.push(line);
  }
  return result.slice(0, 32);
}

function getCanvas(width: number, height: number): {canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D} {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Your browser does not support Canvas 2D rendering.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

function collectLuminance(data: Uint8ClampedArray): number[] {
  const lum = new Array<number>(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    lum[p] = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
  }
  return lum;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1))));
  return sorted[index];
}

function normalizeAndSharpen(ctx: CanvasRenderingContext2D, width: number, height: number, contrastBoost: number) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const lum = collectLuminance(data);
  const sorted = [...lum].sort((a, b) => a - b);
  const low = percentile(sorted, 0.02);
  const high = percentile(sorted, 0.98);
  const range = Math.max(24, high - low);

  const normalized = new Float32Array(lum.length);
  for (let i = 0; i < lum.length; i += 1) {
    let v = (lum[i] - low) / range;
    v = Math.max(0, Math.min(1, v));
    normalized[i] = v;
  }

  const blurred = new Float32Array(normalized.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          sum += normalized[ny * width + nx];
          count += 1;
        }
      }
      blurred[y * width + x] = count ? sum / count : normalized[y * width + x];
    }
  }

  const sharpenAmount = 0.85;
  const contrastAmount = Math.max(0.75, Math.min(2.25, contrastBoost));
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const detail = normalized[p] - blurred[p];
    let v = normalized[p] + detail * sharpenAmount;
    v = (v - 0.5) * contrastAmount + 0.5;
    v = Math.max(0, Math.min(1, v));
    const gray = Math.round(v * 255);
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

function detectBackgroundLevel(data: Uint8ClampedArray, width: number, height: number): number {
  const samples: number[] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 28));
  for (let x = 0; x < width; x += step) {
    const top = x * 4;
    const bottom = (((height - 1) * width + x) * 4);
    samples.push(data[top], data[bottom]);
  }
  for (let y = 0; y < height; y += step) {
    const left = ((y * width) * 4);
    const right = ((y * width + (width - 1)) * 4);
    samples.push(data[left], data[right]);
  }
  samples.sort((a, b) => a - b);
  return percentile(samples, 0.5) / 255;
}

function imageDataToBraille(ctx: CanvasRenderingContext2D, width: number, height: number, options: { contrast: number; inverted: boolean; dither: boolean }): string {
  const data = ctx.getImageData(0, 0, width, height).data;
  const background = detectBackgroundLevel(data, width, height);
  const lines: string[] = [];
  for (let by = 0; by < height; by += 4) {
    let line = "";
    for (let bx = 0; bx < width; bx += 2) {
      let bits = 0;
      let cellTotal = 0;
      let cellCount = 0;
      for (const [dx, dy] of BRAILLE_BITS) {
        const x = bx + dx;
        const y = by + dy;
        if (x >= width || y >= height) continue;
        const idx = (y * width + x) * 4;
        const gray = data[idx] / 255;
        cellTotal += gray;
        cellCount += 1;
      }
      const cellAverage = cellCount ? cellTotal / cellCount : background;
      for (const [dx, dy, bit] of BRAILLE_BITS) {
        const x = bx + dx;
        const y = by + dy;
        if (x >= width || y >= height) continue;
        const idx = (y * width + x) * 4;
        const gray = data[idx] / 255;
        let value = options.inverted ? gray : 1 - gray;
        value = (value - 0.5) * options.contrast + 0.5;
        const adaptiveBase = options.inverted ? background * 0.92 : (1 - background) * 0.92;
        const localBase = options.inverted ? cellAverage : 1 - cellAverage;
        const threshold = (adaptiveBase * 0.58) + (localBase * 0.42);
        const offset = options.dither ? (BAYER_4X4[y % 4][x % 4] / 16 - 0.5) * 0.16 : 0;
        if (value > threshold + offset) bits |= bit;
      }
      line += String.fromCharCode(0x2800 + bits);
    }
    lines.push(line.replace(/[\u2800]+$/g, ""));
  }
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join("\n");
}

/** Renders typed text into actual Braille character glyphs, not a screenshot. */
export function renderDotText(value: string): string {
  const lines = wrapText(value, 17);
  if (lines.length === 0) return "";
  const isBitmap = Array.from(value.toUpperCase()).every((c) => c === "\n" || c === "\r" || Object.hasOwn(FONT, c));
  if (isBitmap) {
    const scale = 2;
    const width = Math.max(12, Math.max(...lines.map((l) => l.length)) * 6 * scale);
    const height = lines.length * 10 * scale;
    const { ctx } = getCanvas(width, height);
    ctx.fillStyle = "#000";
    lines.forEach((line, lineNo) => {
      [...line.toUpperCase()].forEach((ch, index) => {
        const glyph = FONT[ch] ?? FONT["?"];
        glyph.forEach((row, rowNo) => {
          [...row].forEach((pixel, columnNo) => {
            if (pixel === "1") ctx.fillRect((index * 6 + columnNo) * scale, (lineNo * 10 + rowNo) * scale, scale, scale);
          });
        });
      });
    });
    return imageDataToBraille(ctx, width, height, { contrast: 1, inverted: false, dither: false });
  }
  const fontSize = 38;
  const width = 780;
  const height = Math.max(52, lines.length * 58);
  const { ctx } = getCanvas(width, height);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";
  ctx.font = `700 ${fontSize}px sans-serif`;
  lines.forEach((line, index) => ctx.fillText(line, 7, index * 58 + 5, width - 14));
  const { ctx: reduced } = getCanvas(196, Math.ceil(height * 0.251));
  reduced.drawImage(ctx.canvas, 0, 0, 196, Math.ceil(height * 0.251));
  return imageDataToBraille(reduced, 196, Math.ceil(height * 0.251), { contrast: 1.5, inverted: false, dither: false });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Unable to decode this image. Try JPG, PNG, WebP, or GIF.")); };
    img.src = url;
  });
}

export async function renderImage(file: File, settings: RenderOptions): Promise<string> {
  const img = await loadImage(file);
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("The selected image is empty.");
  if (img.naturalWidth > 14000 || img.naturalHeight > 14000) throw new Error("Image dimensions are too large.");
  const columns = Math.max(40, Math.min(132, Math.round(settings.columns)));
  const aspect = img.naturalHeight / img.naturalWidth;
  const charAspect = settings.mode === "braille" ? 0.72 : 0.58;
  const rows = Math.max(6, Math.min(150, Math.round(columns * aspect * charAspect)));
  const width = settings.mode === "braille" ? columns * 2 : columns;
  const height = settings.mode === "braille" ? rows * 4 : rows;

  const intermediateScale = 2;
  const intermediateWidth = Math.max(width, width * intermediateScale);
  const intermediateHeight = Math.max(height, height * intermediateScale);
  const { ctx: work } = getCanvas(intermediateWidth, intermediateHeight);
  work.imageSmoothingEnabled = true;
  work.imageSmoothingQuality = "high";
  work.drawImage(img, 0, 0, intermediateWidth, intermediateHeight);
  normalizeAndSharpen(work, intermediateWidth, intermediateHeight, settings.contrast);

  const { ctx } = getCanvas(width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(work.canvas, 0, 0, width, height);

  if (settings.mode === "braille") {
    return imageDataToBraille(ctx, width, height, {
      contrast: Math.max(0.9, settings.contrast * 0.92),
      inverted: settings.inverted,
      dither: true,
    });
  }

  const raw = ctx.getImageData(0, 0, width, height).data;
  const ramp = " .,:;irsXA253hMHGS#9B&@";
  const lines: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let line = "";
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const gray = (raw[i] * 0.2126 + raw[i + 1] * 0.7152 + raw[i + 2] * 0.0722) / 255;
      let val = settings.inverted ? gray : 1 - gray;
      val = Math.max(0, Math.min(1, (val - 0.5) * settings.contrast + 0.5));
      line += ramp[Math.min(ramp.length - 1, Math.floor(val * (ramp.length - 1)))];
    }
    lines.push(line.replace(/\s+$/g, ""));
  }
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join("\n");
}

export function makeExportContent(options: {rawText: string; textArt: string; imageArt: string; fileName: string | null; mode: string;}): string {
  const divider = "=".repeat(44);
  const output = ["DOTMATRIX / TERMINAL EXPORT", divider, `Render mode: ${options.mode.toUpperCase()}`, ""];
  if (options.rawText) output.push("SOURCE TEXT:", options.rawText, "", "TEXT MATRIX:", options.textArt, "");
  if (options.imageArt) output.push(`IMAGE MATRIX: ${options.fileName ?? "unknown"}`, options.imageArt, "");
  return output.join("\n");
}

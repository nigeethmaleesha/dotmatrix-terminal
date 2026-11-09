/**
 * Dedicated 9:16 setup-screen renderer for the direct, local 1080×1920 recorder.
 * It reflects the portrait editor's input state (not the browser/desktop pixels),
 * so tab bars and horizontal browser cropping never appear in the exported video.
 */
import type { Ink, PortraitRenderMode } from "./stitch-renderer";

export interface WorkspaceCaptureState {
  name: string;
  fileName: string;
  photo: HTMLImageElement | null;
  mode: PortraitRenderMode;
  detail: number;
  duration: number;
  ink: Ink;
  recording: boolean;
}

const W = 1080;
const H = 1920;
const GREEN = "#baff84";
const BG = "#071009";
const WHITE = "#eef6e9";
const MUTED = "#8da58f";
const BORDER = "#315339";
const SANS = 'Inter, "Segoe UI", system-ui, sans-serif';
const MONO = '"Cascadia Code", Consolas, monospace';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, fill: string, stroke?: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function fitText(ctx: CanvasRenderingContext2D, str: string, maxW: number): string {
  if (ctx.measureText(str).width <= maxW) return str;
  const chars = Array.from(str);
  while (chars.length && ctx.measureText(chars.join("") + "…").width > maxW) chars.pop();
  return chars.join("") + "…";
}

function drawWrapped(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, x: number, baseline: number, lineHeight: number, maxLines = 2) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? current + " " + word : word;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  lines.slice(0, maxLines).forEach((line, i) => {
    const content = i === maxLines - 1 && lines.length > maxLines ? fitText(ctx, line + "…", maxWidth) : fitText(ctx, line, maxWidth);
    ctx.fillText(content, x, baseline + i * lineHeight);
  });
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = `700 23px ${MONO}`;
  ctx.fillStyle = "#a2b9a2";
  ctx.fillText(text.toUpperCase(), x, y);
}

function option(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, active: boolean) {
  roundRect(ctx, x, y, width, 82, 10, active ? "#1c3621" : "#0b180e", active ? "#79aa65" : BORDER);
  ctx.font = `750 25px ${SANS}`;
  ctx.fillStyle = active ? WHITE : MUTED;
  ctx.textAlign = "center";
  ctx.fillText(text, x + width / 2, y + 51);
  ctx.textAlign = "left";
}

function slider(ctx: CanvasRenderingContext2D, value: number, min: number, max: number, x: number, y: number, width: number) {
  const f = Math.max(0, Math.min(1, (value - min) / (max - min)));
  roundRect(ctx, x, y, width, 7, 4, "#28412d");
  roundRect(ctx, x, y, Math.max(1, width * f), 7, 4, GREEN);
  ctx.beginPath();
  ctx.arc(x + width * f, y + 4, 13, 0, Math.PI * 2);
  ctx.fillStyle = "#08100a";
  ctx.fill();
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 4;
  ctx.stroke();
}

function imageContain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  if (!image.naturalWidth || !image.naturalHeight) return;
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

export function paintWorkspaceCapture(canvas: HTMLCanvasElement, values: WorkspaceCaptureState): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(540, 630, 90, 540, 630, 900);
  glow.addColorStop(0, "rgba(49,86,47,.12)");
  glow.addColorStop(1, "rgba(8,16,9,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const margin = 90;
  ctx.fillStyle = GREEN;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    ctx.globalAlpha = ((c + r) % 3 === 0) ? .44 : 1;
    ctx.fillRect(margin + c * 18, 94 + r * 18, 12, 12);
  }
  ctx.globalAlpha = 1;
  ctx.font = `900 47px ${SANS}`;
  ctx.fillStyle = WHITE;
  ctx.fillText("DOT", 174, 144);
  const dotWidth = ctx.measureText("DOT").width;
  ctx.fillStyle = GREEN;
  ctx.fillText("MATRIX_", 174 + dotWidth, 144);
  ctx.fillStyle = BORDER;
  ctx.fillRect(margin, 181, 900, 2);

  ctx.font = `750 23px ${MONO}`;
  ctx.fillStyle = GREEN;
  ctx.fillText("// 9:16 PORTRAIT WORKSPACE", margin, 265);
  ctx.font = `760 70px ${SANS}`;
  ctx.fillStyle = WHITE;
  ctx.fillText("Create your portrait", margin, 365);
  ctx.font = `400 27px ${SANS}`;
  ctx.fillStyle = MUTED;
  ctx.fillText("Name, photo and drawing — one clean vertical story.", margin, 411);

  label(ctx, "01 / NAME OR MESSAGE", margin, 490);
  roundRect(ctx, margin, 510, 900, 123, 12, "#0b1a0f", BORDER);
  ctx.fillStyle = GREEN;
  ctx.font = `750 42px ${SANS}`;
  if (values.name.trim()) {
    drawWrapped(ctx, values.name, 810, 125, 563, 49, 2);
  } else {
    ctx.fillStyle = "#68836a";
    ctx.fillText("Type your name here...", 125, 589);
  }

  label(ctx, "02 / YOUR PHOTO", margin, 710);
  roundRect(ctx, margin, 730, 900, 415, 14, "#0b1a0f", BORDER);
  if (values.photo) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(102, 742, 876, 319, 8);
    ctx.clip();
    imageContain(ctx, values.photo, 102, 742, 876, 319);
    ctx.restore();
    ctx.font = `600 24px ${MONO}`;
    ctx.fillStyle = "#b5d4ae";
    ctx.fillText(fitText(ctx, values.fileName, 850), 112, 1105);
  } else {
    ctx.textAlign = "center";
    ctx.font = `700 38px ${SANS}`;
    ctx.fillStyle = WHITE;
    ctx.fillText("Upload your portrait", 540, 900);
    ctx.font = `500 25px ${MONO}`;
    ctx.fillStyle = MUTED;
    ctx.fillText("JPG · PNG · WEBP", 540, 954);
    ctx.textAlign = "left";
  }

  label(ctx, "03 / OUTPUT STYLE", margin, 1235);
  const gap = 18;
  const optionW = (900 - gap * 2) / 3;
  option(ctx, "Matrix Stitch", margin, 1260, optionW, values.mode === "matrix");
  option(ctx, "Pencil", margin + optionW + gap, 1260, optionW, values.mode === "pencil");
  option(ctx, "Original", margin + (optionW + gap) * 2, 1260, optionW, values.mode === "original");

  let detailY = 1450;
  let detailSliderY = 1490;
  let durationY = 1586;
  let durationSliderY = 1626;
  let buttonY = 1690;
  let buttonTextY = 1760;

  if (values.mode === "pencil") {
    label(ctx, "04 / PENCIL INK", margin, 1392);
    const inkW = (900 - gap) / 2;
    option(ctx, "Graphite", margin, 1417, inkW, values.ink === "graphite");
    option(ctx, "Phosphor", margin + inkW + gap, 1417, inkW, values.ink === "phosphor");
    detailY = 1542;
    detailSliderY = 1582;
    durationY = 1672;
    durationSliderY = 1712;
    buttonY = 1768;
    buttonTextY = 1838;
  }

  label(ctx, "DRAWING DETAIL", margin, detailY);
  ctx.font = `800 25px ${MONO}`;
  ctx.fillStyle = GREEN;
  ctx.textAlign = "right";
  ctx.fillText(`${values.detail}%`, 990, detailY);
  ctx.textAlign = "left";
  slider(ctx, values.detail, 35, 100, margin, detailSliderY, 900);

  label(ctx, "DRAWING DURATION", margin, durationY);
  ctx.textAlign = "right";
  ctx.fillStyle = GREEN;
  ctx.fillText(`${values.duration} sec`, 990, durationY);
  ctx.textAlign = "left";
  slider(ctx, values.duration, 5, 30, margin, durationSliderY, 900);

  roundRect(ctx, margin, buttonY, 900, 110, 13, GREEN);
  ctx.fillStyle = "#12220e";
  ctx.font = `900 31px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillText("▶  START DRAWING", 540, buttonTextY);
  ctx.textAlign = "left";

  ctx.font = `700 22px ${MONO}`;
  ctx.fillStyle = values.recording ? "#ff8888" : MUTED;
  ctx.fillText(values.recording ? "● REC  ·  WORKFLOW CAPTURE" : "READY TO CREATE", margin, 1867);
  ctx.textAlign = "right";
  ctx.fillStyle = MUTED;
  ctx.fillText("1080 × 1920", 990, 1867);
  ctx.textAlign = "left";
}

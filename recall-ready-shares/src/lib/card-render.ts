// Canvas renderer for story cards (PNG) and short clips (video).
import { HAZARD_LABELS, type Hazard } from "./recall-parse";
import { loadHazardIllustration } from "./illustrations";

export type CardFormat = "instagram" | "tiktok";
export const FORMAT_SIZE: Record<CardFormat, { w: number; h: number; label: string }> = {
  instagram: { w: 1080, h: 1350, label: "Instagram 4:5" },
  tiktok: { w: 1080, h: 1920, label: "TikTok 9:16" },
};

export type CardRecall = {
  id: string; source: string; recall_number?: string | null; title: string; product: string; firm: string; reason: string;
  hazard: string; classification: string | null; states: string[]; nationwide: boolean;
  lot_numbers: string[]; recall_date: string; source_url: string;
};

type Palette = { bg: string; fg: string; alert: string; caution: string; paper: string; muted: string };

function palette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return { bg: v("--story-bg"), fg: v("--story-fg"), alert: v("--story-alert"), caution: v("--story-caution"), paper: v("--story-paper"), muted: v("--story-muted") };
}

export async function ensureFonts() {
  await Promise.all([
    document.fonts.load('80px "Archivo Black"'),
    document.fonts.load('600 40px "Public Sans"'),
    document.fonts.load('500 32px "JetBrains Mono"'),
  ]).catch(() => undefined);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else line = test;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = lines[maxLines - 1]!.replace(/\s*\S*$/, "") + "…";
  }
  return lines;
}

function chip(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string, fg: string, h = 64, font = '500 34px "JetBrains Mono"') {
  ctx.font = font;
  const padX = h * 0.35;
  const w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + 2);
  ctx.textBaseline = "alphabetic";
  return w;
}

const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

export type Presenter = { photo: HTMLImageElement; name: string };
export type RenderInput = { recall: CardRecall; format: CardFormat; headline: string; highlightState?: string | null; presenter?: Presenter | null; expandStates?: boolean };

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Could not load photo"));
    img.src = src;
  });
}

/** Draw one frame. `t` is seconds into the clip; pass Infinity for the static card. */
export function drawFrame(ctx: CanvasRenderingContext2D, input: RenderInput, art: HTMLImageElement, p: Palette, t: number) {
  const { w, h } = FORMAT_SIZE[input.format];
  const tall = input.format === "tiktok";
  const r = input.recall;
  const pad = 72;
  const a = (start: number) => (t === Infinity ? 1 : ease((t - start) / 0.5));

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);

  // Hazard stripe band
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, 36);
  ctx.clip();
  const shift = t === Infinity ? 0 : (t * 60) % 56;
  for (let x = -56; x < w + 56; x += 56) {
    ctx.fillStyle = p.caution;
    ctx.beginPath();
    ctx.moveTo(x + shift, 36); ctx.lineTo(x + 28 + shift, 0); ctx.lineTo(x + 56 + shift, 0); ctx.lineTo(x + 28 + shift, 36);
    ctx.fill();
  }
  ctx.restore();

  let y = tall ? 150 : 110;

  // Recall badge + headline
  ctx.globalAlpha = a(0);
  ctx.font = '44px "Archivo Black"';
  const badgeW = ctx.measureText("RECALL ALERT").width + 44;
  ctx.fillStyle = p.alert;
  ctx.beginPath();
  ctx.roundRect(pad, y, badgeW, 72, 8);
  ctx.fill();
  ctx.fillStyle = p.fg;
  ctx.fillText("RECALL ALERT", pad + 22, y + 52);
  const pr = input.presenter;
  const prSize = 150;
  ctx.font = '700 40px "Public Sans"';
  ctx.fillStyle = p.caution;
  ctx.fillText(wrap(ctx, input.headline.toUpperCase(), w - pad * 2 - (pr ? prSize + 30 : 0), 1)[0] ?? "", pad, y + 130);
  if (pr) {
    const cx = w - pad - prSize / 2;
    const cy = y + prSize / 2 - 10;
    ctx.save();
    ctx.globalAlpha = a(0.15);
    ctx.fillStyle = p.alert;
    ctx.beginPath();
    ctx.arc(cx, cy, prSize / 2 + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, prSize / 2, 0, Math.PI * 2);
    ctx.clip();
    const im = pr.photo;
    const s = Math.min(im.naturalWidth, im.naturalHeight);
    ctx.drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, cx - prSize / 2, cy - prSize / 2, prSize, prSize);
    ctx.restore();
  }
  y += 180;

  const pulse = t === Infinity ? 1 : 1 + Math.sin(t * 4) * 0.03;
  const drawArt = (cx: number, cy: number, size: number) => {
    ctx.globalAlpha = a(0.3);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse * a(0.3), pulse * a(0.3));
    ctx.fillStyle = p.caution;
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(art, -size * 0.32, -size * 0.32, size * 0.64, size * 0.64);
    ctx.restore();
  };
  const fitTitle = (maxW: number, base: number) => {
    let size = base;
    const longest = r.title.split(/\s+/).reduce((m, wd) => (wd.length > m.length ? wd : m), "");
    do { ctx.font = `${size}px "Archivo Black"`; size -= 4; } while (ctx.measureText(longest).width > maxW && size > 36);
    return size + 4;
  };

  ctx.fillStyle = p.fg;
  if (tall) {
    const artSize = 380;
    drawArt(w / 2, y + artSize / 2, artSize);
    y += artSize + 60;
    ctx.globalAlpha = a(0.6);
    ctx.fillStyle = p.fg;
    const fs = fitTitle(w - pad * 2, 80);
    const lh = fs * 1.12;
    const lines = wrap(ctx, r.title, w - pad * 2, 4);
    lines.forEach((l, i) => ctx.fillText(l, pad, y + fs + i * lh));
    y += lines.length * lh + fs * 0.5 + 40;
  } else {
    const artSize = 280;
    drawArt(w - pad - artSize / 2, y + artSize / 2, artSize);
    ctx.globalAlpha = a(0.6);
    ctx.fillStyle = p.fg;
    const titleW = w - pad * 2 - artSize - 40;
    const fs = fitTitle(titleW, 62);
    const lh = fs * 1.12;
    const lines = wrap(ctx, r.title, titleW, 4);
    lines.forEach((l, i) => ctx.fillText(l, pad, y + fs + i * lh));
    y += Math.max(artSize, lines.length * lh + 20) + 60;
  }

  // Hazard line
  ctx.globalAlpha = a(1.2);
  ctx.fillStyle = p.alert;
  ctx.font = '42px "Archivo Black"';
  ctx.fillText((HAZARD_LABELS[r.hazard as Hazard] ?? "Safety hazard").toUpperCase(), pad, y);
  y += 56;
  ctx.fillStyle = p.fg;
  ctx.font = '500 36px "Public Sans"';
  wrap(ctx, r.reason, w - pad * 2, tall ? 4 : 2).forEach((l, i) => ctx.fillText(l, pad, y + i * 48));
  y += (tall ? 4 : 2) * 48 + 40;

  // States
  ctx.globalAlpha = a(1.9);
  ctx.fillStyle = p.muted;
  ctx.font = '600 30px "Public Sans"';
  ctx.fillText("AFFECTED STATES", pad, y);
  y += 22;
  let x = pad;
  const stateList = r.states;
  const total = stateList.length;
  const expanded = !!input.expandStates;
  const chipH = expanded ? 46 : 64;
  const chipFont = expanded ? '500 24px "JetBrains Mono"' : '500 34px "JetBrains Mono"';
  const rowH = expanded ? (tall ? 56 : 52) : 76;
  const maxRows = expanded ? (tall ? 6 : 4) : (tall ? 3 : 2);
  let shown: string[];
  if (r.nationwide && total === 0) {
    shown = ["NATIONWIDE"];
  } else if (expanded) {
    shown = stateList;
  } else {
    shown = stateList.slice(0, 4);
    if (total > 4 && input.highlightState && !shown.includes(input.highlightState)) shown[3] = input.highlightState;
  }
  let rows = 1;
  let drawn = 0;
  for (const s of shown) {
    ctx.font = chipFont;
    const cw = ctx.measureText(s).width + chipH * 0.7;
    if (x + cw > w - pad) { x = pad; y += rowH; rows++; if (rows > maxRows) break; }
    const hl = s === input.highlightState;
    x += chip(ctx, x, y, s, hl ? p.alert : p.paper, hl ? p.fg : p.bg, chipH, chipFont) + 10;
    drawn++;
  }
  const hidden = (r.nationwide && total === 0 ? 0 : total) - drawn;
  if (hidden > 0) {
    chip(ctx, x, y, `+${hidden} more`, p.caution, p.bg, chipH, chipFont);
  }
  y += chipH + (expanded ? 34 : 46);

  // Lots
  ctx.globalAlpha = a(2.6);
  ctx.fillStyle = p.muted;
  ctx.font = '600 30px "Public Sans"';
  ctx.fillText("LOT NUMBERS / CODES", pad, y);
  y += 50;
  ctx.fillStyle = p.caution;
  ctx.font = '500 36px "JetBrains Mono"';
  const lots = r.lot_numbers.length ? r.lot_numbers.join("  ·  ") : "See source for product codes";
  wrap(ctx, lots, w - pad * 2, tall ? 3 : 2).forEach((l, i) => ctx.fillText(l, pad, y + i * 48));

  // Footer source
  ctx.globalAlpha = a(3.2);
  const fy = h - (tall ? 200 : 120);
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, fy, w, h - fy);
  ctx.fillStyle = p.bg;
  ctx.font = '700 30px "Public Sans"';
  const recallNo = r.recall_number ? ` · Recall ${r.recall_number}` : "";
  ctx.fillText(`SOURCE: ${r.source}${recallNo} · ${r.recall_date}`, pad, fy + 52);
  ctx.font = '500 26px "Public Sans"';
  const tail = pr?.name ? `Shared by ${pr.name} · ` : "";
  ctx.fillText(wrap(ctx, `${tail}${r.firm}. Stop using the product and check the official notice.`, w - pad * 2, 1)[0] ?? "", pad, fy + 92);
  ctx.globalAlpha = 1;
}

async function prepare(input: RenderInput) {
  await ensureFonts();
  const p = palette();
  const art = await loadHazardIllustration(input.recall.hazard, p.bg);
  const { w, h } = FORMAT_SIZE[input.format];
  return { p, art, w, h };
}

export async function renderCardToCanvas(canvas: HTMLCanvasElement, input: RenderInput) {
  const { p, art, w, h } = await prepare(input);
  canvas.width = w;
  canvas.height = h;
  drawFrame(canvas.getContext("2d")!, input, art, p, Infinity);
}

export async function renderCardPng(input: RenderInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await renderCardToCanvas(canvas, input);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("PNG export failed"))), "image/png"));
}

export const CLIP_SECONDS = 7;

export async function renderClip(input: RenderInput, onProgress?: (p: number) => void): Promise<{ blob: Blob; ext: string }> {
  const { p, art, w, h } = await prepare(input);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const mime = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  drawFrame(ctx, input, art, p, 0);
  rec.start();
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      drawFrame(ctx, input, art, p, t);
      onProgress?.(Math.min(t / CLIP_SECONDS, 1));
      if (t < CLIP_SECONDS) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
  return { blob: new Blob(chunks, { type: mime.split(";")[0] ?? "video/webm" }), ext: mime.includes("mp4") ? "mp4" : "webm" };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

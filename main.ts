// gta6-meme-x-01 — deterministic GTA 6 meme generator.
//
// Renders a 1024x1024 Vice City sunset meme as a PNG and copies POST.json
// from the bot dir to the output dir. Node 22+ standard library only.
// No network, no wall clock, no randomness: the same input always yields
// byte-identical output (fixed zlib level, no tIME chunk in the PNG).
//
// Scene: hot-pink-to-orange-to-purple sunset sky, low sun, palm silhouettes,
// city skyline, ocean strip, the make.fun sheet-ghost cameo with a magenta
// star coin, classic meme captions top and bottom in a hand-written 5x7
// bitmap font, white with a thick black outline.

import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const WIDTH = 1024;
const HEIGHT = 1024;

// ---------------------------------------------------------------------------
// Pixel buffer (RGBA, row-major, opaque writes + alpha blending)
// ---------------------------------------------------------------------------

const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);

type RGB = [number, number, number];

function put(x: number, y: number, c: RGB): void {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || xi >= WIDTH || yi < 0 || yi >= HEIGHT) return;
  const o = (yi * WIDTH + xi) * 4;
  pixels[o] = c[0];
  pixels[o + 1] = c[1];
  pixels[o + 2] = c[2];
  pixels[o + 3] = 255;
}

// Blend colour c over the existing pixel with opacity a (0..1).
function blend(x: number, y: number, c: RGB, a: number): void {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || xi >= WIDTH || yi < 0 || yi >= HEIGHT) return;
  const o = (yi * WIDTH + xi) * 4;
  pixels[o] = Math.round(pixels[o] * (1 - a) + c[0] * a);
  pixels[o + 1] = Math.round(pixels[o + 1] * (1 - a) + c[1] * a);
  pixels[o + 2] = Math.round(pixels[o + 2] * (1 - a) + c[2] * a);
  pixels[o + 3] = 255;
}

function fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(HEIGHT, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(WIDTH, Math.ceil(x1)); x++) {
      put(x, y, c);
    }
  }
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) put(x, y, c);
    }
  }
}

// Filled polygon (even-odd scanline fill), points as [x, y] pairs.
function fillPolygon(pts: Array<[number, number]>, c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) put(x, y, c);
    }
  }
}

// Four-point sparkle (star) centred at (cx, cy), tip radius r.
function sparkle(cx: number, cy: number, r: number, c: RGB): void {
  const w = r * 0.28;
  fillPolygon(
    [
      [cx, cy - r],
      [cx + w, cy - w],
      [cx + r, cy],
      [cx + w, cy + w],
      [cx, cy + r],
      [cx - w, cy + w],
      [cx - r, cy],
      [cx - w, cy - w],
    ],
    c,
  );
}

// Five-point star centred at (cx, cy), outer radius ro, inner radius ri.
function star5(cx: number, cy: number, ro: number, ri: number, c: RGB): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  fillPolygon(pts, c);
}

// Deterministic 0..1 value from an integer (no Math.random anywhere).
function hash(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = (x * 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(c0: RGB, c1: RGB, t: number): RGB {
  return [
    Math.round(lerp(c0[0], c1[0], t)),
    Math.round(lerp(c0[1], c1[1], t)),
    Math.round(lerp(c0[2], c1[2], t)),
  ];
}

// ---------------------------------------------------------------------------
// Hand-written 5x7 bitmap font. Each glyph is 7 rows of 5 cells, "#" = on.
// ---------------------------------------------------------------------------

const FONT: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#..##", "#.#.#", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "...#.", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  // Lowercase letters (x-height forms) so the "make.fun" wordmark renders
  // in its proper lowercase spelling.
  a: [".....", ".....", ".###.", "....#", ".####", "#...#", ".###."],
  e: [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
  f: ["..##.", ".#...", ".#...", "####.", ".#...", ".#...", ".#..."],
  k: [".....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#."],
  m: [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#"],
  n: [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"],
  u: [".....", ".....", "#...#", "#...#", "#...#", "#...#", ".###."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  "'": ["..#..", "..#..", "..#..", ".....", ".....", ".....", "....."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  "/": ["....#", "....#", "...#.", "...#.", "..#..", ".#...", "#...."],
};

const BLANK = [".....", ".....", ".....", ".....", ".....", ".....", "....."];

// Width of a line in pixels at a given scale (5px glyph + 1px gap).
function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return text.length * 6 * scale - scale;
}

// Draw one glyph's "on" cells as scale x scale blocks at (x, y).
function drawGlyph(ch: string, x: number, y: number, scale: number, c: RGB): void {
  const g = FONT[ch] ?? BLANK;
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 5; col++) {
      if (g[row][col] === "#") {
        fillRect(x + col * scale, y + row * scale, x + (col + 1) * scale, y + (row + 1) * scale, c);
      }
    }
  }
}

// Draw text with a thick outline: black pass at every offset inside a disc
// of radius `outline`, then the white pass on top.
function drawTextOutlined(
  text: string,
  x: number,
  y: number,
  scale: number,
  fg: RGB,
  outlineColor: RGB,
): void {
  const outline = Math.max(2, Math.floor(scale * 0.8));
  for (let dy = -outline; dy <= outline; dy++) {
    for (let dx = -outline; dx <= outline; dx++) {
      if (dx * dx + dy * dy > outline * outline) continue;
      if (dx === 0 && dy === 0) continue;
      for (let i = 0; i < text.length; i++) {
        drawGlyph(text[i], x + i * 6 * scale + dx, y + dy, scale, outlineColor);
      }
    }
  }
  for (let i = 0; i < text.length; i++) {
    drawGlyph(text[i], x + i * 6 * scale, y, scale, fg);
  }
}

function drawTextCentred(text: string, y: number, scale: number, fg: RGB, outlineColor: RGB): void {
  const x = Math.floor((WIDTH - textWidth(text, scale)) / 2);
  drawTextOutlined(text, x, y, scale, fg, outlineColor);
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

const SKY_TOP: RGB = [255, 45, 149]; // hot pink
const SKY_MID: RGB = [255, 122, 80]; // orange
const SKY_LOW: RGB = [88, 28, 120]; // deep purple
const SILHOUETTE: RGB = [16, 8, 30]; // near-black purple
const SKYLINE: RGB = [28, 12, 48];
const OCEAN: RGB = [18, 18, 70];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

function skyColorAt(y: number): RGB {
  if (y < 420) return lerpColor(SKY_TOP, SKY_MID, y / 420);
  return lerpColor(SKY_MID, SKY_LOW, (y - 420) / 460);
}

function drawSky(): void {
  for (let y = 0; y < 880; y++) {
    fillRect(0, y, WIDTH, y + 1, skyColorAt(y));
  }
}

function drawSun(): void {
  // Warm halo rings blended over the sky, then the pale core.
  disc(512, 610, 205, [255, 170, 110]);
  for (let y = 405; y < 815; y++) {
    for (let x = 307; x < 717; x++) {
      const dx = x - 512;
      const dy = y - 610;
      if (dx * dx + dy * dy <= 205 * 205) blend(x, y, skyColorAt(y), 0.55);
    }
  }
  disc(512, 610, 175, [255, 200, 120]);
  disc(512, 610, 148, [255, 238, 175]);
  disc(512, 610, 112, [255, 248, 210]);
}

function drawSkyline(): void {
  let x = -12;
  let i = 0;
  while (x < WIDTH) {
    const w = 52 + Math.floor(hash(i) * 62);
    const h = 60 + Math.floor(hash(i + 1000) * 175);
    const top = 880 - h;
    fillRect(x, top, x + w, 880, SKYLINE);
    // Antenna on some towers.
    if (hash(i + 2000) > 0.6) {
      fillRect(x + Math.floor(w / 2) - 2, top - 26, x + Math.floor(w / 2) + 2, top, SKYLINE);
      disc(x + Math.floor(w / 2), top - 28, 4, [255, 90, 120]);
    }
    // Lit windows, deterministic per building.
    for (let wy = top + 12; wy < 868; wy += 18) {
      for (let wx = x + 8; wx < x + w - 8; wx += 14) {
        const lit = hash(i * 7919 + wx * 13 + wy * 7) > 0.62;
        if (lit) fillRect(wx, wy, wx + 5, wy + 7, [255, 200, 90]);
      }
    }
    x += w + 4;
    i++;
  }
}

function drawOcean(): void {
  fillRect(0, 880, WIDTH, HEIGHT, OCEAN);
  // Sun reflection: warm dashes under the sun.
  for (let k = 0; k < 9; k++) {
    const y = 892 + k * 14;
    const w = 150 - k * 10;
    for (let x = 512 - Math.floor(w / 2); x < 512 + Math.floor(w / 2); x++) {
      if (hash(k * 131 + x) > 0.35) blend(x, y, [255, 180, 120], 0.35);
      if (hash(k * 131 + x + 500) > 0.85) blend(x, y + 1, [255, 180, 120], 0.35);
    }
  }
  // Cool shimmer lines.
  const lines = [910, 936, 962, 990, 1014];
  for (let li = 0; li < lines.length; li++) {
    const y = lines[li];
    for (let x = 0; x < WIDTH; x++) {
      if (hash(li * 977 + x * 3) > 0.72) blend(x, y, [110, 100, 200], 0.5);
    }
  }
}

// Palm tree: curved trunk + drooping fronds, drawn as strings of discs.
function drawPalm(baseX: number, baseY: number, crownX: number, crownY: number): void {
  const mx = (baseX + crownX) / 2 + (crownX > baseX ? 26 : -26);
  const my = (baseY + crownY) / 2;
  const steps = 42;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const ax = lerp(lerp(baseX, mx, t), lerp(mx, crownX, t), t);
    const ay = lerp(lerp(baseY, my, t), lerp(my, crownY, t), t);
    disc(ax, ay, lerp(13, 7, t), SILHOUETTE);
  }
  // Coconuts under the crown.
  disc(crownX - 10, crownY + 12, 8, SILHOUETTE);
  disc(crownX + 8, crownY + 14, 8, SILHOUETTE);
  // Seven fronds fanning out from the crown.
  const tips: Array<[number, number, number, number]> = [
    [crownX - 150, crownY - 58, crownX - 78, crownY - 96],
    [crownX - 128, crownY + 6, crownX - 66, crownY - 62],
    [crownX - 78, crownY + 52, crownX - 40, crownY - 34],
    [crownX - 8, crownY + 66, crownX - 4, crownY - 30],
    [crownX + 72, crownY + 54, crownX + 38, crownY - 32],
    [crownX + 126, crownY + 8, crownX + 64, crownY - 58],
    [crownX + 148, crownY - 56, crownX + 76, crownY - 94],
  ];
  for (const [tx, ty, cx, cy] of tips) {
    const fsteps = 26;
    for (let s = 0; s <= fsteps; s++) {
      const t = s / fsteps;
      const ax = lerp(lerp(crownX, cx, t), lerp(cx, tx, t), t);
      const ay = lerp(lerp(crownY, cy, t), lerp(cy, ty, t), t);
      disc(ax, ay, lerp(7, 2, t), SILHOUETTE);
    }
  }
}

// The make.fun sheet ghost: dome head, straight sides, scalloped hem.
function drawGhost(cx: number, topY: number, w: number, h: number, c: RGB): void {
  const r = w / 2;
  const domeY = topY + r;
  const hemY = topY + h - 20;
  disc(cx, domeY, r, c);
  fillRect(cx - r, domeY, cx + r, hemY, c);
  const bumps = 4;
  const bw = w / bumps;
  for (let i = 0; i < bumps; i++) {
    disc(cx - r + bw * (i + 0.5), hemY, bw / 2, c);
  }
}

function drawGhostCameo(): void {
  const cx = 810;
  const topY = 192;
  const w = 150;
  const h = 215;
  // Dark rim so the white sheet reads against the bright sky.
  drawGhost(cx, topY - 4, w + 10, h + 10, [40, 16, 70]);
  drawGhost(cx, topY, w, h, [250, 250, 255]);
  // Soft lavender shade down the right side of the sheet.
  for (let y = topY + 40; y < topY + h - 10; y++) {
    for (let x = cx + 52; x < cx + 75; x++) {
      const dx = x - cx;
      const dy = y - (topY + 75);
      if (dx * dx + dy * dy < 75 * 75 || y > topY + 75) {
        blend(x, y, [214, 210, 240], 0.35);
      }
    }
  }
  // Two sparkle eyes.
  sparkle(cx - 32, topY + 92, 17, [25, 15, 55]);
  sparkle(cx + 32, topY + 92, 17, [25, 15, 55]);
  // Magenta star coin floating beside the ghost.
  star5(922, 402, 36, 15, [255, 130, 205]);
  star5(922, 402, 30, 12, [255, 45, 170]);
  sparkle(922, 402, 7, WHITE);
  // Little sky sparkles around the ghost.
  sparkle(700, 240, 9, [255, 240, 200]);
  sparkle(668, 330, 7, WHITE);
  sparkle(930, 250, 8, [255, 240, 200]);
}

function drawSkySparkles(): void {
  const spots: Array<[number, number, number]> = [
    [120, 150, 8],
    [210, 210, 6],
    [330, 140, 7],
    [430, 200, 6],
    [560, 150, 8],
    [640, 210, 6],
    [180, 300, 6],
    [420, 300, 7],
    [600, 320, 6],
    [960, 160, 7],
    [80, 420, 6],
    [240, 470, 7],
  ];
  for (const [x, y, r] of spots) sparkle(x, y, r, [255, 240, 200]);
}

function render(): void {
  drawSky();
  drawSun();
  drawSkySparkles();
  drawSkyline();
  drawOcean();
  drawPalm(92, 884, 152, 566);
  drawPalm(936, 884, 868, 548);
  drawGhostCameo();
  // Captions: classic meme layout, white with a thick black outline.
  drawTextCentred("WAITED 13 YEARS FOR GTA VI", 48, 5, WHITE, BLACK);
  drawTextCentred("MY AI AGENT GOT PAID ON MAKE.FUN", 922, 4, WHITE, BLACK);
  // Wordmark, bottom-left corner.
  drawTextOutlined("make.fun", 24, 984, 3, WHITE, BLACK);
}

// ---------------------------------------------------------------------------
// Minimal deterministic PNG writer (RGBA, filter 0, fixed deflate level).
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type 6 = RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = WIDTH * 4 + 1;
  const raw = Buffer.alloc(stride * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter: none
    pixels.copy(raw, rowStart + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main(): void {
  const botDir = process.env.MAKEFUN_BOT_DIR ?? "/bot";
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });

  render();
  const pngPath = join(outDir, "meme.png");
  writeFileSync(pngPath, encodePng());
  console.log(`wrote ${pngPath}`);

  const postSrc = join(botDir, "POST.json");
  const postDst = join(outDir, "POST.json");
  copyFileSync(postSrc, postDst);
  console.log(`copied ${postSrc} -> ${postDst}`);
}

main();

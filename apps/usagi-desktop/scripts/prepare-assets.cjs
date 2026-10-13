"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { PNG } = require("pngjs");
const { WIDTH, HEIGHT, ANIMATIONS } = require("../src/pet-core.js");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const assetRoot = path.join(appRoot, "assets");
const sourcePaths = {
  webp: "pets/usagi-codex/spritesheet.webp",
  png: "pets/usagi-codex/spritesheet.png"
};
const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const fromSource = process.argv.includes("--from-source");
const bundledAvailable = Object.keys(sourcePaths).every((format) =>
  fs.existsSync(path.join(assetRoot, "spritesheet." + format)));
const useBundled = bundledAvailable && !fromSource;
const inputPaths = Object.fromEntries(Object.entries(sourcePaths).map(([format, relative]) =>
  [format, useBundled ? path.join(assetRoot, "spritesheet." + format) : path.join(repoRoot, relative)]));
const buffers = Object.fromEntries(Object.entries(inputPaths).map(([format, absolute]) =>
  [format, fs.readFileSync(absolute)]));
const previousManifestPath = path.join(assetRoot, "asset-manifest.json");
const previousManifest = useBundled && fs.existsSync(previousManifestPath) ?
  JSON.parse(fs.readFileSync(previousManifestPath, "utf8")) : null;
const source = Object.fromEntries(Object.entries(sourcePaths).map(([format, relative]) => {
  const digest = sha256(buffers[format]);
  const previousSource = previousManifest && previousManifest.source && previousManifest.source[format];
  const provenanceMatches = previousSource && previousSource.sha256 === digest && typeof previousSource.path === "string";
  const sourcePath = !useBundled ? relative : provenanceMatches ? previousSource.path :
    path.relative(repoRoot, inputPaths[format]).split(path.sep).join("/");
  return [format, { path: sourcePath, sha256: digest, bytes: buffers[format].length }];
}));
const atlas = PNG.sync.read(buffers.png);
if (atlas.width !== WIDTH * 8 || atlas.height !== HEIGHT * 11) {
  throw new Error("Unexpected atlas dimensions: " + atlas.width + " x " + atlas.height);
}

const cells = [];
const rows = [];
const alphaThreshold = 24;
for (let row = 0; row < 11; row++) {
  const rowCells = [];
  for (let column = 0; column < 8; column++) {
    let left = WIDTH, top = HEIGHT, right = -1, bottom = -1, alphaPixelCount = 0;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const offset = ((row * HEIGHT + y) * atlas.width + column * WIDTH + x) * 4;
        if (atlas.data[offset + 3] <= alphaThreshold) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
        alphaPixelCount++;
      }
    }
    if (right < 0) continue;
    const cell = { row, column, bounds: { left, top, right, bottom }, groundY: bottom, alphaPixelCount };
    cells.push(cell); rowCells.push(cell);
  }
  rows.push({ row, groundY: Math.max(...rowCells.map((cell) => cell.groundY)),
    frameGrounds: rowCells.map((cell) => ({ column: cell.column, groundY: cell.groundY })) });
}
for (const [id, animation] of Object.entries(ANIMATIONS)) {
  for (let column = 0; column < animation.durations.length; column++) {
    if (!cells.some((cell) => cell.row === animation.row && cell.column === column)) {
      throw new Error("Animation samples an empty atlas cell: " + id + " " + column);
    }
  }
}
if (cells.length !== 74) throw new Error("Expected 74 populated atlas cells, found " + cells.length);

const manifest = {
  schemaVersion: 1,
  source,
  spritesheetPath: "spritesheet.webp",
  atlas: { width: atlas.width, height: atlas.height, columns: 8, rows: 11, cellWidth: WIDTH, cellHeight: HEIGHT },
  alphaThreshold,
  grounding: {
    stableGroundY: 194,
    coordinates: "Cell-local source pixels; right, bottom and groundY are inclusive.",
    strategy: "Use one offset per animation row, preserving each frame's original movement. For jumping, align the final landing frame instead of the row maximum.",
    jumpLandingGroundY: cells.find((cell) => cell.row === 4 && cell.column === 4).groundY
  },
  rows,
  cells
};

function iconPng(size) {
  // App icons use a full badge, independent of the transparent pet canvas.
  const samples = 4;
  const resolution = size * samples;
  const working = new PNG({ width: resolution, height: resolution });
  const image = new PNG({ width: size, height: size });
  const bounds = cells.find(cell => cell.row === 0 && cell.column === 0).bounds;
  const cropWidth = bounds.right - bounds.left + 1;
  const cropHeight = bounds.bottom - bounds.top + 1;
  const scale = resolution * 0.86 / cropHeight;
  const drawWidth = cropWidth * scale;
  const offsetX = (resolution - drawWidth) / 2;
  const offsetY = resolution * 0.07;
  const radius = resolution * 0.46;
  const center = resolution / 2;
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const to = (y * resolution + x) * 4;
      if (Math.hypot(x + 0.5 - center, y + 0.5 - center) <= radius) {
        working.data.set([243,200,67,255], to);
      }
      const sourceX = Math.floor((x + 0.5 - offsetX) / scale) + bounds.left;
      const sourceY = Math.floor((y + 0.5 - offsetY) / scale) + bounds.top;
      if (sourceX < bounds.left || sourceX > bounds.right || sourceY < bounds.top || sourceY > bounds.bottom) continue;
      const from = (sourceY * atlas.width + sourceX) * 4;
      const sourceAlpha = atlas.data[from + 3] / 255;
      const targetAlpha = working.data[to + 3] / 255;
      const combinedAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
      if (!combinedAlpha) continue;
      for (let channel = 0; channel < 3; channel++) {
        working.data[to + channel] = Math.round((atlas.data[from + channel] * sourceAlpha + working.data[to + channel] * targetAlpha * (1 - sourceAlpha)) / combinedAlpha);
      }
      working.data[to + 3] = Math.round(combinedAlpha * 255);
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const total = [0,0,0,0];
      for (let dy = 0; dy < samples; dy++) for (let dx = 0; dx < samples; dx++) {
        const from = (((y * samples + dy) * resolution) + x * samples + dx) * 4;
        const alpha = working.data[from + 3];
        total[3] += alpha;
        for (let channel = 0; channel < 3; channel++) total[channel] += working.data[from + channel] * alpha;
      }
      const to = (y * size + x) * 4;
      if (!total[3]) continue;
      for (let channel = 0; channel < 3; channel++) image.data[to + channel] = Math.round(total[channel] / total[3]);
      image.data[to + 3] = Math.round(total[3] / (samples * samples));
    }
  }
  return PNG.sync.write(image);
}

const iconSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const iconImages = iconSizes.map(iconPng);
const icoHeader = Buffer.alloc(6 + 16 * iconImages.length);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(iconImages.length, 4);
let imageOffset = icoHeader.length;
iconImages.forEach((buffer, index) => {
  const offset = 6 + index * 16;
  icoHeader[offset] = iconSizes[index] === 256 ? 0 : iconSizes[index];
  icoHeader[offset + 1] = icoHeader[offset];
  icoHeader.writeUInt16LE(1, offset + 4);
  icoHeader.writeUInt16LE(32, offset + 6);
  icoHeader.writeUInt32LE(buffer.length, offset + 8);
  icoHeader.writeUInt32LE(imageOffset, offset + 12);
  imageOffset += buffer.length;
});

fs.mkdirSync(assetRoot, { recursive: true });
fs.writeFileSync(path.join(assetRoot, "spritesheet.webp"), buffers.webp);
fs.writeFileSync(path.join(assetRoot, "spritesheet.png"), buffers.png);
fs.writeFileSync(path.join(assetRoot, "icon.png"), iconImages[iconImages.length - 1]);
fs.writeFileSync(path.join(assetRoot, "icon.ico"), Buffer.concat([icoHeader, ...iconImages]));
fs.writeFileSync(path.join(assetRoot, "asset-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
fs.writeFileSync(path.join(assetRoot, "asset-manifest.js"), "window.UsagiAssets = " + JSON.stringify(manifest) + ";\n");
for (const [format, absolute] of Object.entries(inputPaths)) {
  if (sha256(fs.readFileSync(absolute)) !== source[format].sha256) {
    throw new Error("Input changed while preparing assets: " + absolute);
  }
  if (sha256(fs.readFileSync(path.join(assetRoot, "spritesheet." + format))) !== source[format].sha256) {
    throw new Error("Copied asset hash differs from its source: " + format);
  }
}
console.log(JSON.stringify({ prepared: true, inputMode: useBundled ? "bundled" : "source", cells: cells.length, dimensions: [atlas.width, atlas.height],
  rowGrounds: rows.map(({ row, groundY }) => ({ row, groundY })),
  jumpLandingGroundY: manifest.grounding.jumpLandingGroundY, source }, null, 2));

#!/usr/bin/env node
import { crc32, deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(scriptDir, '..', 'assets');
const repoRoot = path.resolve(scriptDir, '..', '..');

/**
 * Os recursos da loja ficam fora de `mobile/`: `assetBundlePatterns` é `**\/*`,
 * então qualquer arquivo sob o projeto Expo entraria no binário. Ícone de ficha
 * e banner não têm por que viajar dentro do APK.
 */
const storeDir = path.resolve(repoRoot, 'docs', 'brand');

const PALETTE = {
  primary: [0x1b, 0x7a, 0x46],
  primaryDark: [0x14, 0x5c, 0x34],
  surface: [0xff, 0xff, 0xff],
  background: [0xf4, 0xf8, 0xf5],
};

const SAMPLES = 4;

const PIN = {
  centre: { x: 0.5, y: 0.4 },
  radius: 0.28,
  tipY: 0.95,
};

function isInsidePin(x, y) {
  const dx = x - PIN.centre.x;
  const dy = y - PIN.centre.y;

  if (Math.hypot(dx, dy) <= PIN.radius) return true;

  const tip = { x: PIN.centre.x, y: PIN.tipY };
  const distanceToTip = tip.y - PIN.centre.y;
  if (distanceToTip <= PIN.radius) return false;

  const beta = Math.acos(PIN.radius / distanceToTip);
  const left = {
    x: PIN.centre.x + PIN.radius * Math.cos(Math.PI / 2 + beta),
    y: PIN.centre.y + PIN.radius * Math.sin(Math.PI / 2 + beta),
  };
  const right = {
    x: PIN.centre.x + PIN.radius * Math.cos(Math.PI / 2 - beta),
    y: PIN.centre.y + PIN.radius * Math.sin(Math.PI / 2 - beta),
  };

  return isInsideTriangle({ x, y }, tip, left, right);
}

function isInsideTriangle(p, a, b, c) {
  const sign = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}

function isInsideLeaf(x, y) {
  const angle = -Math.PI / 4;
  const dx = x - PIN.centre.x;
  const dy = y - PIN.centre.y;
  const u = dx * Math.cos(angle) - dy * Math.sin(angle);
  const v = dx * Math.sin(angle) + dy * Math.cos(angle);

  const lensRadius = 0.2;
  const offset = 0.135;

  return Math.hypot(u, v - offset) <= lensRadius && Math.hypot(u, v + offset) <= lensRadius;
}

function isInsideRoundedSquare(x, y, cornerRadius) {
  const dx = Math.max(cornerRadius - x, 0, x - (1 - cornerRadius));
  const dy = Math.max(cornerRadius - y, 0, y - (1 - cornerRadius));
  return Math.hypot(dx, dy) <= cornerRadius;
}

/**
 * A marca é desenhada num quadrado. Numa tela retangular esse quadrado é
 * centralizado e as coordenadas do desenho passam a ser medidas a partir dele,
 * não da tela: assim o pino não estica. Com `width === height` a conta é a
 * mesma de antes, e os ícones saem idênticos.
 */
function renderMark({ width, height, size, background, backgroundShape, pin, leaf, scale }) {
  const canvasWidth = width ?? size;
  const canvasHeight = height ?? size;

  const side = Math.min(canvasWidth, canvasHeight);
  const insetX = (canvasWidth - side) / 2;
  const insetY = (canvasHeight - side) / 2;

  const pixels = Buffer.alloc(canvasWidth * canvasHeight * 4);

  for (let py = 0; py < canvasHeight; py += 1) {
    for (let px = 0; px < canvasWidth; px += 1) {
      let backgroundHits = 0;
      let pinHits = 0;
      let leafHits = 0;

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px + (sx + 0.5) / SAMPLES - insetX) / side;
          const y = (py + (sy + 0.5) / SAMPLES - insetY) / side;

          if (background) {
            // Banner sangra até a borda; ícone usa o quadrado arredondado.
            if (backgroundShape === 'full') backgroundHits += 1;
            else if (isInsideRoundedSquare(x, y, 0.22)) backgroundHits += 1;
          }

          const mx = (x - 0.5) / scale + 0.5;
          const my = (y - 0.5) / scale + 0.5;

          if (mx < 0 || mx > 1 || my < 0 || my > 1) continue;
          if (isInsideLeaf(mx, my)) leafHits += 1;
          else if (isInsidePin(mx, my)) pinHits += 1;
        }
      }

      const total = SAMPLES * SAMPLES;
      let colour = [0, 0, 0];
      let alpha = 0;

      if (background && backgroundHits > 0) {
        colour = background;
        alpha = backgroundHits / total;
      }

      const paint = (nextColour, coverage) => {
        if (coverage === 0) return;
        const nextAlpha = alpha + coverage * (1 - alpha);
        for (let channel = 0; channel < 3; channel += 1) {
          colour[channel] =
            (nextColour[channel] * coverage + colour[channel] * alpha * (1 - coverage)) /
            (nextAlpha || 1);
        }
        alpha = nextAlpha;
      };

      colour = [...colour];
      paint(pin, pinHits / total);
      paint(leaf, leafHits / total);

      const offset = (py * canvasWidth + px) * 4;
      pixels[offset] = Math.round(colour[0]);
      pixels[offset + 1] = Math.round(colour[1]);
      pixels[offset + 2] = Math.round(colour[2]);
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }

  return pixels;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData) >>> 0, 0);

  return Buffer.concat([length, typeAndData, checksum]);
}

function encodePng(pixels, width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (stride + 1)] = 0;
    pixels.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const OUTPUTS = [
  {
    file: 'icon.png',
    size: 1024,
    background: PALETTE.primary,
    pin: PALETTE.surface,
    leaf: PALETTE.primary,
    scale: 0.62,
  },
  {
    file: 'adaptive-icon.png',
    size: 1024,
    background: null,
    pin: PALETTE.surface,
    leaf: PALETTE.primary,
    scale: 0.46,
  },
  {
    file: 'splash-icon.png',
    size: 512,
    background: null,
    pin: PALETTE.primary,
    leaf: PALETTE.background,
    scale: 0.88,
  },
  {
    file: 'logo-mark.png',
    size: 512,
    background: null,
    pin: PALETTE.primary,
    leaf: PALETTE.surface,
    scale: 0.88,
  },
  {
    file: 'favicon.png',
    size: 64,
    background: PALETTE.primary,
    pin: PALETTE.surface,
    leaf: PALETTE.primary,
    scale: 0.62,
  },

  // Ficha da Play Store. O console recusa o ícone em qualquer tamanho que não
  // seja 512x512, e o de `assets/` é 1024 porque é o que o Expo quer.
  {
    file: 'play-icon.png',
    dir: storeDir,
    size: 512,
    background: PALETTE.primary,
    pin: PALETTE.surface,
    leaf: PALETTE.primary,
    scale: 0.62,
  },
  {
    file: 'play-feature-graphic.png',
    dir: storeDir,
    width: 1024,
    height: 500,
    background: PALETTE.primary,
    backgroundShape: 'full',
    pin: PALETTE.surface,
    leaf: PALETTE.primary,
    scale: 0.5,
  },
];

for (const output of OUTPUTS) {
  const width = output.width ?? output.size;
  const height = output.height ?? output.size;
  const directory = output.dir ?? assetsDir;

  mkdirSync(directory, { recursive: true });

  const pixels = renderMark(output);
  const png = encodePng(pixels, width, height);
  writeFileSync(path.join(directory, output.file), png);

  const label = path.relative(repoRoot, path.join(directory, output.file)).replace(/\\/g, '/');
  console.log(`wrote ${label} (${width}x${height}, ${png.length} bytes)`);
}

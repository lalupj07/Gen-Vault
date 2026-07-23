// Generate Microsoft Store tile assets from GenVault icon renderer.
const fs = require('fs');
const path = require('path');
const { createPNG, renderIcon } = require('../../src-tauri/icons/generate.js');

const assetsDir = path.join(__dirname, 'Assets');
const BG = { r: 10, g: 10, b: 18, a: 255 };

function scaleRgba(src, srcSize, dstSize) {
  const dst = Buffer.alloc(dstSize * dstSize * 4);
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      const sx = Math.min(srcSize - 1, Math.floor((x + 0.5) * srcSize / dstSize));
      const sy = Math.min(srcSize - 1, Math.floor((y + 0.5) * srcSize / dstSize));
      const so = (sy * srcSize + sx) * 4;
      const doff = (y * dstSize + x) * 4;
      dst[doff] = src[so];
      dst[doff + 1] = src[so + 1];
      dst[doff + 2] = src[so + 2];
      dst[doff + 3] = src[so + 3];
    }
  }
  return dst;
}

function wideLogo(width, height, iconSize) {
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    buf[o] = BG.r;
    buf[o + 1] = BG.g;
    buf[o + 2] = BG.b;
    buf[o + 3] = BG.a;
  }

  const icon = renderIcon(iconSize);
  const offsetX = Math.floor((width - iconSize) / 2);
  const offsetY = Math.floor((height - iconSize) / 2);

  for (let y = 0; y < iconSize; y++) {
    for (let x = 0; x < iconSize; x++) {
      const io = (y * iconSize + x) * 4;
      const alpha = icon[io + 3];
      if (alpha === 0) continue;
      const px = offsetX + x;
      const py = offsetY + y;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const po = (py * width + px) * 4;
      const a = alpha / 255;
      buf[po] = Math.round(icon[io] * a + BG.r * (1 - a));
      buf[po + 1] = Math.round(icon[io + 1] * a + BG.g * (1 - a));
      buf[po + 2] = Math.round(icon[io + 2] * a + BG.b * (1 - a));
      buf[po + 3] = 255;
    }
  }
  return buf;
}

function writeSquare(name, size) {
  const src = renderIcon(Math.max(size, 256));
  const rgba = size >= 256 ? src : scaleRgba(src, 256, size);
  const png = createPNG(size, size, rgba);
  fs.writeFileSync(path.join(assetsDir, name), png);
  console.log(`✓ Assets/${name} (${size}x${size})`);
}

function writeWide(name, width, height) {
  const iconSize = Math.min(width, height) - 20;
  const rgba = wideLogo(width, height, iconSize);
  const png = createPNG(width, height, rgba);
  fs.writeFileSync(path.join(assetsDir, name), png);
  console.log(`✓ Assets/${name} (${width}x${height})`);
}

if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

writeSquare('Square44x44Logo.png', 44);
writeSquare('Square71x71Logo.png', 71);
writeSquare('Square150x150Logo.png', 150);
writeSquare('Square310x310Logo.png', 310);
writeSquare('StoreLogo.png', 50);
writeWide('Wide310x150Logo.png', 310, 150);
writeWide('SplashScreen.png', 620, 300);

console.log('\nStore MSIX assets generated.');

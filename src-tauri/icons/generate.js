// Generate PNG icons for Tauri from raw pixel data
const fs = require('fs');
const path = require('path');

// Minimal PNG encoder for RGBA data
function createPNG(width, height, rgbaData) {
  const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let c, table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([len, typeAndData, crc]);
  }

  function deflateRaw(data) {
    const zlib = require('zlib');
    return zlib.deflateSync(data);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT - add filter byte (0 = none) to each row
  const rowLen = width * 4 + 1;
  const rawData = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    rawData[y * rowLen] = 0; // filter type: none
    rgbaData.copy(rawData, y * rowLen + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = deflateRaw(rawData);

  // IEND
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', compressed), iend]);
}

function renderIcon(size) {
  const buf = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const nx = (x - size / 2) / (size / 2);
      const ny = (y - size / 2) / (size / 2);

      // Rounded rect
      const cr = 0.35;
      const inRect = Math.abs(nx) < 0.85 && Math.abs(ny) < 0.85;
      const dx = Math.max(0, Math.abs(nx) - (0.85 - cr));
      const dy = Math.max(0, Math.abs(ny) - (0.85 - cr));
      const inRR = inRect || (dx * dx + dy * dy < cr * cr);

      if (!inRR) { buf[offset + 3] = 0; continue; }

      // BG gradient
      const bgR = Math.floor(12 + ny * 8);
      const bgG = Math.floor(12 + ny * 8);
      const bgB = Math.floor(18 + ny * 14);

      // Shield
      const sT = -0.55, sB = 0.55, sW = 0.45;
      const inS = ny > sT && ny < sB && Math.abs(nx) < sW * (ny < 0 ? 1 : (1 - (ny / sB) * 0.4));
      const bt = 0.04;
      const iW = sW - bt;
      const inIS = ny > sT + bt && ny < sB - bt && Math.abs(nx) < iW * (ny < 0 ? 1 : (1 - ny / (sB - bt) * 0.4));
      const onBorder = inS && !inIS;

      // Lock
      const lT = 0.0, lB = 0.3, lW = 0.15;
      const inL = ny > lT && ny < lB && Math.abs(nx) < lW;
      const sR = 0.12;
      const dist = Math.sqrt(nx * nx + (ny - lT) * (ny - lT));
      const inSh = ny < lT && dist < sR && dist > sR - 0.04 && Math.abs(nx) < sR;

      // Keyhole
      const kR = 0.035, kY = 0.12;
      const kD = Math.sqrt(nx * nx + (ny - kY) * (ny - kY));
      const inK = kD < kR || (Math.abs(nx) < 0.015 && ny > kY && ny < kY + 0.08);

      let r, g, b;
      if (inK && inL) {
        r = 0; g = 229; b = 255;
      } else if (inL || inSh) {
        const t = (ny - sT) / (sB - sT);
        r = Math.floor(0 + t * 61);
        g = Math.floor(229 - t * 137);
        b = Math.floor(255 - t * 1);
      } else if (onBorder) {
        const t = (ny - sT) / (sB - sT);
        r = Math.floor(0 + t * 61);
        g = Math.floor(229 - t * 139);
        b = Math.floor(255 - t * 1);
      } else {
        r = bgR; g = bgG; b = bgB;
      }

      buf[offset] = Math.min(255, Math.max(0, r));
      buf[offset + 1] = Math.min(255, Math.max(0, g));
      buf[offset + 2] = Math.min(255, Math.max(0, b));
      buf[offset + 3] = 255;
    }
  }
  return buf;
}

// ICO generator (same as before)
function createICO(sizes, buffers) {
  const images = sizes.map((s, i) => {
    const pixels = buffers[i];
    const rowSize = s * 4;
    const imageSize = rowSize * s;

    // Convert RGBA top-down to BGRA bottom-up
    const pixelData = Buffer.alloc(imageSize);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const srcOff = (y * s + x) * 4;
        const dstOff = ((s - 1 - y) * s + x) * 4;
        pixelData[dstOff] = pixels[srcOff + 2];     // B
        pixelData[dstOff + 1] = pixels[srcOff + 1]; // G
        pixelData[dstOff + 2] = pixels[srcOff];     // R
        pixelData[dstOff + 3] = pixels[srcOff + 3]; // A
      }
    }

    const infoHeader = Buffer.alloc(40);
    infoHeader.writeUInt32LE(40, 0);
    infoHeader.writeInt32LE(s, 4);
    infoHeader.writeInt32LE(s * 2, 8);
    infoHeader.writeUInt16LE(1, 12);
    infoHeader.writeUInt16LE(32, 14);
    infoHeader.writeUInt32LE(0, 16);
    infoHeader.writeUInt32LE(imageSize, 20);

    const maskRowSize = Math.ceil(s / 32) * 4;
    const maskData = Buffer.alloc(maskRowSize * s);

    return Buffer.concat([infoHeader, pixelData, maskData]);
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);

  let dataOffset = 6 + sizes.length * 16;
  const dirEntries = sizes.map((s, i) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(s >= 256 ? 0 : s, 0);
    entry.writeUInt8(s >= 256 ? 0 : s, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(images[i].length, 8);
    entry.writeUInt32LE(dataOffset, 12);
    dataOffset += images[i].length;
    return entry;
  });

  return Buffer.concat([header, ...dirEntries, ...images]);
}

module.exports = { createPNG, renderIcon, createICO };

if (require.main === module) {
  const dir = path.join(__dirname);

  // Generate PNGs
  const pngSizes = [32, 128, 256];
  for (const s of pngSizes) {
    const rgba = renderIcon(s);
    const png = createPNG(s, s, rgba);
    const name = s === 256 ? `128x128@2x.png` : `${s}x${s}.png`;
    fs.writeFileSync(path.join(dir, name), png);
    console.log(`✓ ${name} (${(png.length / 1024).toFixed(1)} KB)`);
  }

  // Generate ICO
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoBuffers = icoSizes.map(s => renderIcon(s));
  const ico = createICO(icoSizes, icoBuffers);
  fs.writeFileSync(path.join(dir, 'icon.ico'), ico);
  console.log(`✓ icon.ico (${(ico.length / 1024).toFixed(1)} KB)`);

  // Stub ICNS (macOS - not needed for Windows but required by config)
  fs.writeFileSync(path.join(dir, 'icon.icns'), Buffer.alloc(0));
  console.log(`✓ icon.icns (stub)`);

  console.log('\nAll Tauri icons generated.');
}

// Play Store high-res icon (512×512) from GenVault icon renderer.
const fs = require('fs');
const path = require('path');
const { createPNG, renderIcon } = require('../src-tauri/icons/generate.js');

const outDir = path.join(__dirname, '..', 'store', 'play');
fs.mkdirSync(outDir, { recursive: true });

const size = 512;
const png = createPNG(size, size, renderIcon(size));
const out = path.join(outDir, 'app-icon-512.png');
fs.writeFileSync(out, png);
console.log(`Wrote ${out} (${(png.length / 1024).toFixed(1)} KB)`);

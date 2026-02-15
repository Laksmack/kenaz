#!/usr/bin/env node
/**
 * Render Raidō icon PNGs from the SVG source at all required sizes.
 * Also regenerates the .icns bundle.
 *
 * Usage: node scripts/render-icons.js
 */

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SVG_SOURCE = path.join(__dirname, '..', 'branding', 'icon-512.svg');
const BRANDING_DIR = path.join(__dirname, '..', 'branding');

const SIZES = [1024, 512, 256, 128, 64, 32, 16];

// For small sizes, scale up the stroke width for legibility
const STROKE_OVERRIDES = {
  32: 5,
  16: 3.5,
};

function generateSvg(size) {
  const svgContent = fs.readFileSync(SVG_SOURCE, 'utf-8');

  // For small sizes, override stroke width
  if (STROKE_OVERRIDES[size]) {
    const sw = STROKE_OVERRIDES[size];
    // Scale all dimensions from 512 to target size
    const scale = size / 512;
    return svgContent
      .replace(/width="512"/, `width="${size}"`)
      .replace(/height="512"/, `height="${size}"`)
      .replace(/stroke-width="[^"]*"/g, `stroke-width="${sw}"`);
  }

  // For larger sizes, just set the width/height and let SVG scale
  return svgContent
    .replace(/width="512"/, `width="${size}"`)
    .replace(/height="512"/, `height="${size}"`);
}

async function renderPng(size) {
  const svg = generateSvg(size);
  const svgBuffer = Buffer.from(svg);

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const img = await loadImage(svgBuffer);
  ctx.drawImage(img, 0, 0, size, size);

  return canvas.toBuffer('image/png');
}

async function generateIcns() {
  const iconsetDir = path.join(BRANDING_DIR, 'icon.iconset');
  fs.mkdirSync(iconsetDir, { recursive: true });

  const icnsSizes = [
    { size: 16, name: 'icon_16x16.png' },
    { size: 32, name: 'icon_16x16@2x.png' },
    { size: 32, name: 'icon_32x32.png' },
    { size: 64, name: 'icon_32x32@2x.png' },
    { size: 128, name: 'icon_128x128.png' },
    { size: 256, name: 'icon_128x128@2x.png' },
    { size: 256, name: 'icon_256x256.png' },
    { size: 512, name: 'icon_256x256@2x.png' },
    { size: 512, name: 'icon_512x512.png' },
    { size: 1024, name: 'icon_512x512@2x.png' },
  ];

  for (const { size, name } of icnsSizes) {
    const srcFile = path.join(BRANDING_DIR, `icon-${size}.png`);
    const destFile = path.join(iconsetDir, name);
    fs.copyFileSync(srcFile, destFile);
  }

  execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(BRANDING_DIR, 'icon.icns')}"`);
  fs.rmSync(iconsetDir, { recursive: true });
  console.log('  icon.icns');
}

async function main() {
  console.log('[Raidō icons] Rendering PNGs from SVG...');

  for (const size of SIZES) {
    const buf = await renderPng(size);
    const outPath = path.join(BRANDING_DIR, `icon-${size}.png`);
    fs.writeFileSync(outPath, buf);
    console.log(`  icon-${size}.png (${buf.length} bytes)`);
  }

  console.log('[Raidō icons] Generating .icns bundle...');
  await generateIcns();

  console.log('[Raidō icons] Done.');
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});

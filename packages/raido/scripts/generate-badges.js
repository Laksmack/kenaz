#!/usr/bin/env node
/**
 * Generate pre-rendered dock badge icons for Raidō.
 *
 * Produces 1024×1024 PNGs with the base icon + a brown (#C2885A) badge circle
 * overlapping the top-right corner, matching native macOS badge sizing (Things, Mail, etc).
 *
 * Usage: node scripts/generate-badges.js
 *
 * Output:
 *   branding/badges/badge-none.png        (clean icon, no badge)
 *   branding/badges/arabic/badge-N.png    (N = 1..19, plus badge-19plus.png)
 *   branding/badges/runic/badge-N.png     (N = 1..19, plus badge-19plus.png)
 */

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

const SIZE = 1024;

// Badge sizing — match native macOS badge proportions (Things, Mail, Messages)
const BADGE_DIAMETER_RATIO = 0.35; // 35% of icon width
const BADGE_COLOR = '#C2885A';
const TEXT_COLOR = '#FFFFFF';

const BASE_ICON = path.join(__dirname, '..', 'branding', 'icon-1024.png');
const OUT_DIR = path.join(__dirname, '..', 'branding', 'badges');

// ── Helpers ──────────────────────────────────────────────────

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// ── Arabic Badge Drawing ─────────────────────────────────────

function drawArabicBadge(ctx, count, cx, cy, r) {
  const label = count > 19 ? '19+' : String(count);

  // Sizing: bold, chunky, fills the circle
  const fontSize = label.length <= 1
    ? r * 1.35    // single digit: big and bold
    : label.length === 2
      ? r * 1.15  // double digit
      : r * 0.92; // "19+"

  ctx.font = `800 ${fontSize}px "SF Pro Rounded", "Outfit", "Helvetica Neue", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(label, cx, cy + fontSize * 0.035);
}

// ── Runic Pentadic Numeral Drawing ───────────────────────────

/**
 * Viking pentadic numeral system:
 *   1-4:   stav + N ticks
 *   5:     stav + bow (right)
 *   6-9:   stav + bow + (N-5) ticks
 *   10:    stav + opposing bows
 *   11-14: stav + opposing bows + (N-10) ticks
 *   15:    stav + opposing bows + bow (below)
 *   16-19: stav + opposing bows + bow + (N-15) ticks
 *   19+:   glyph for 19 + small "+" to the right
 */
function drawRunicGlyph(ctx, count, cx, cy, r) {
  const sw = r * 0.16; // stroke width: chunky, hand-carved feel
  ctx.strokeStyle = TEXT_COLOR;
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const stavTop = cy - r * 0.65;
  const stavBot = cy + r * 0.65;
  const stavLen = stavBot - stavTop;

  // For 19+, shrink and shift left to make room for "+"
  const isPlus = count > 19;
  const glyphCount = isPlus ? 19 : count;
  const offsetX = isPlus ? -r * 0.15 : 0;
  const gcx = cx + offsetX;

  // Draw the stav (vertical staff)
  ctx.beginPath();
  ctx.moveTo(gcx, stavTop);
  ctx.lineTo(gcx, stavBot);
  ctx.stroke();

  // Decompose the number
  const fives = Math.floor(glyphCount / 5);
  const ones = glyphCount % 5;

  const hasOpposingBows = fives >= 2;
  const upperBow = fives === 1 || fives === 3;
  const lowerBow = fives >= 3;
  const ticks = ones;

  let tickStartY;
  let bowRegionTopY, bowRegionBotY;
  let oppBowTopY, oppBowBotY;
  let lowerBowTopY, lowerBowBotY;

  if (hasOpposingBows && lowerBow) {
    oppBowTopY = stavTop + stavLen * 0.05;
    oppBowBotY = stavTop + stavLen * 0.35;
    lowerBowTopY = stavTop + stavLen * 0.38;
    lowerBowBotY = stavTop + stavLen * 0.63;
    tickStartY = stavTop + stavLen * 0.66;
  } else if (hasOpposingBows) {
    oppBowTopY = stavTop + stavLen * 0.08;
    oppBowBotY = stavTop + stavLen * 0.45;
    tickStartY = stavTop + stavLen * 0.52;
  } else if (upperBow) {
    bowRegionTopY = stavTop + stavLen * 0.08;
    bowRegionBotY = stavTop + stavLen * 0.45;
    tickStartY = stavTop + stavLen * 0.52;
  } else {
    tickStartY = stavTop + stavLen * 0.15;
  }

  const tickLen = r * 0.35;
  const tickSpacing = stavLen * 0.14;

  if (hasOpposingBows) {
    const bowW = r * 0.4;
    const midY = (oppBowTopY + oppBowBotY) / 2;
    ctx.beginPath();
    ctx.moveTo(gcx, oppBowTopY);
    ctx.quadraticCurveTo(gcx + bowW, midY, gcx, oppBowBotY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gcx, oppBowTopY);
    ctx.quadraticCurveTo(gcx - bowW, midY, gcx, oppBowBotY);
    ctx.stroke();
  }

  if (upperBow && !hasOpposingBows) {
    const bowW = r * 0.45;
    const midY = (bowRegionTopY + bowRegionBotY) / 2;
    ctx.beginPath();
    ctx.moveTo(gcx, bowRegionTopY);
    ctx.quadraticCurveTo(gcx + bowW, midY, gcx, bowRegionBotY);
    ctx.stroke();
  }

  if (lowerBow) {
    const bowW = r * 0.4;
    const midY = (lowerBowTopY + lowerBowBotY) / 2;
    ctx.beginPath();
    ctx.moveTo(gcx, lowerBowTopY);
    ctx.quadraticCurveTo(gcx + bowW, midY, gcx, lowerBowBotY);
    ctx.stroke();
  }

  for (let i = 0; i < ticks; i++) {
    const ty = tickStartY + i * tickSpacing;
    ctx.beginPath();
    ctx.moveTo(gcx, ty);
    ctx.lineTo(gcx + tickLen, ty);
    ctx.stroke();
  }

  if (isPlus) {
    const plusX = cx + r * 0.55;
    const plusY = cy + r * 0.3;
    const plusSize = r * 0.22;
    ctx.lineWidth = sw * 0.7;
    ctx.beginPath();
    ctx.moveTo(plusX - plusSize, plusY);
    ctx.lineTo(plusX + plusSize, plusY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(plusX, plusY - plusSize);
    ctx.lineTo(plusX, plusY + plusSize);
    ctx.stroke();
  }
}

// ── Main Generation ──────────────────────────────────────────

async function generateBadges() {
  console.log('[Raidō badges] Loading base icon...');
  const baseImg = await loadImage(BASE_ICON);

  const badgeR = (SIZE * BADGE_DIAMETER_RATIO) / 2;

  // Position: overlapping top-right corner of the icon, like native macOS badges.
  // The center sits so the badge extends ~30% beyond the icon's top-right edge.
  const badgeCx = SIZE - badgeR * 0.72;
  const badgeCy = badgeR * 0.72;

  ensureDir(path.join(OUT_DIR, 'arabic'));
  ensureDir(path.join(OUT_DIR, 'runic'));

  // ── badge-none.png (clean icon) ──
  {
    const canvas = createCanvas(SIZE, SIZE);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(baseImg, 0, 0, SIZE, SIZE);
    const buf = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(OUT_DIR, 'badge-none.png'), buf);
    console.log('[Raidō badges] badge-none.png');
  }

  // ── Generate numbered badges ──
  const counts = [];
  for (let i = 1; i <= 19; i++) counts.push(i);
  counts.push(20); // represents "19+"

  for (const style of ['arabic', 'runic']) {
    for (const count of counts) {
      const canvas = createCanvas(SIZE, SIZE);
      const ctx = canvas.getContext('2d');

      // Draw base icon
      ctx.drawImage(baseImg, 0, 0, SIZE, SIZE);

      // Draw badge circle — no border, just the solid brown circle
      ctx.beginPath();
      ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = BADGE_COLOR;
      ctx.fill();

      // Draw content
      if (style === 'arabic') {
        drawArabicBadge(ctx, count, badgeCx, badgeCy, badgeR);
      } else {
        drawRunicGlyph(ctx, count, badgeCx, badgeCy, badgeR);
      }

      const filename = count > 19 ? 'badge-19plus.png' : `badge-${count}.png`;
      const buf = canvas.toBuffer('image/png');
      fs.writeFileSync(path.join(OUT_DIR, style, filename), buf);
      process.stdout.write(`  ${style}/${filename}\n`);
    }
  }

  console.log(`\n[Raidō badges] Generated ${counts.length * 2 + 1} badge icons.`);
}

generateBadges().catch((err) => {
  console.error('Badge generation failed:', err);
  process.exit(1);
});

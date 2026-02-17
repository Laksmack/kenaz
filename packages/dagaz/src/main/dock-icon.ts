import { app, nativeImage } from 'electron';
import path from 'path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

let fontsRegistered = false;
let midnightTimer: ReturnType<typeof setTimeout> | null = null;
let eventCheckInterval: ReturnType<typeof setInterval> | null = null;
let lastRenderedDate = '';
let onUpdateCallback: (() => void) | null = null;

// Register Outfit font family
function ensureFonts() {
  if (fontsRegistered) return;
  const fontsDir = getFontsDir();
  try {
    GlobalFonts.registerFromPath(path.join(fontsDir, 'Outfit-Medium.ttf'), 'Outfit');
    GlobalFonts.registerFromPath(path.join(fontsDir, 'Outfit-Bold.ttf'), 'Outfit');
    fontsRegistered = true;
    console.log('[Dagaz] Outfit font registered');
  } catch (e) {
    console.error('[Dagaz] Failed to register fonts:', e);
  }
}

function getFontsDir(): string {
  const appPath = app.getAppPath();
  if (appPath.endsWith('.asar')) {
    return path.join(appPath.replace(/\.asar$/, '.asar.unpacked'), 'branding', 'fonts');
  }
  return path.join(appPath, 'branding', 'fonts');
}

/**
 * Render the dynamic Dagaz dock icon.
 *
 * Layout (512x512 viewBox):
 * - Background: rounded rect with sky-blue gradient
 * - 3-letter day name at y≈112, font-size 60, weight 500, opacity 0.85
 * - Full Dagaz rune ᛞ (shifted down 12px), stroke-width 35.84
 * - Date number at y≈420, weight 700
 *   - 1-digit: font-size 118
 *   - 2-digit: font-size 100
 * - Optional event indicator dot: cx=418, cy=106, r=28 (Kenaz orange)
 */
export function renderDockIcon(opts: {
  showDate?: boolean;
  showEventDot?: boolean;
} = {}): Electron.NativeImage {
  const { showDate = true, showEventDot = false } = opts;
  ensureFonts();

  const S = 512;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');

  // ── Background: rounded rect with gradient ──
  const r = 102.4;
  const x0 = 25.6, y0 = 25.6, w = 460.8, h = 460.8;
  const grad = ctx.createLinearGradient(51.2, 460.8, 460.8, 51.2);
  grad.addColorStop(0, '#2D5F8A');
  grad.addColorStop(1, '#7AB8D4');
  ctx.beginPath();
  roundedRect(ctx, x0, y0, w, h, r);
  ctx.fillStyle = grad;
  ctx.fill();

  // ── Dagaz rune ᛞ — shifted down 12px ──
  const runeShift = 12;
  ctx.strokeStyle = '#FFF8F0';
  ctx.lineWidth = 35.84;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Diagonal X: left V and right V
  ctx.beginPath();
  ctx.moveTo(128, 160 + runeShift);
  ctx.lineTo(256, 256 + runeShift);
  ctx.lineTo(128, 352 + runeShift);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(384, 160 + runeShift);
  ctx.lineTo(256, 256 + runeShift);
  ctx.lineTo(384, 352 + runeShift);
  ctx.stroke();

  // Left vertical stave
  ctx.beginPath();
  ctx.moveTo(128, 160 + runeShift);
  ctx.lineTo(128, 352 + runeShift);
  ctx.stroke();

  // Right vertical stave
  ctx.beginPath();
  ctx.moveTo(384, 160 + runeShift);
  ctx.lineTo(384, 352 + runeShift);
  ctx.stroke();

  if (showDate) {
    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const dateNum = now.getDate().toString();

    ctx.fillStyle = '#FFF8F0';
    ctx.textAlign = 'center';

    // Day name: y≈112, font-size 60, weight 500, opacity 0.85, letter-spacing 5
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.font = '500 60px Outfit';
    drawSpacedText(ctx, dayName, 256, 112, 5);
    ctx.restore();

    // Date number: y≈420, weight 700
    const dateFontSize = dateNum.length === 1 ? 118 : 100;
    ctx.font = `700 ${dateFontSize}px Outfit`;
    ctx.textBaseline = 'middle';
    ctx.fillText(dateNum, 256, 420);
  }

  // ── Event indicator dot ──
  if (showEventDot) {
    ctx.beginPath();
    ctx.arc(418, 106, 28, 0, Math.PI * 2);
    ctx.fillStyle = '#E8571F';
    ctx.fill();
    ctx.strokeStyle = '#FFF8F0';
    ctx.lineWidth = 4;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.stroke();
  }

  const pngBuffer = canvas.toBuffer('image/png');
  return nativeImage.createFromBuffer(Buffer.from(pngBuffer));
}

/** Draw text with letter-spacing (canvas doesn't support it natively) */
function drawSpacedText(ctx: any, text: string, x: number, y: number, spacing: number) {
  const chars = text.split('');
  const totalWidth = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + spacing * (chars.length - 1);
  let cx = x - totalWidth / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const ch of chars) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

/** Draw a rounded rectangle path */
function roundedRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ── Lifecycle ────────────────────────────────────────────────

/** Set/update the dock icon based on config */
export function updateDockIcon(opts: {
  dynamic: boolean;
  showEventDot?: boolean;
}) {
  if (process.platform !== 'darwin' || !app.dock) return;

  if (!opts.dynamic) {
    // Reset to static icon
    const staticIcon = getStaticIconPath();
    try {
      const img = nativeImage.createFromPath(staticIcon);
      app.dock.setIcon(img);
    } catch {
      // Fall back to rendering without text
      app.dock.setIcon(renderDockIcon({ showDate: false }));
    }
    lastRenderedDate = '';
    return;
  }

  const now = new Date();
  const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

  // Skip if already rendered for this date (and same dot state)
  const dotKey = opts.showEventDot ? '-dot' : '';
  if (lastRenderedDate === dateKey + dotKey) return;

  const icon = renderDockIcon({ showDate: true, showEventDot: opts.showEventDot });
  app.dock.setIcon(icon);
  lastRenderedDate = dateKey + dotKey;
  console.log(`[Dagaz] Dock icon updated: ${now.toLocaleDateString('en-US', { weekday: 'short' })} ${now.getDate()}${opts.showEventDot ? ' (event dot)' : ''}`);
}

function getStaticIconPath(): string {
  const appPath = app.getAppPath();
  if (appPath.endsWith('.asar')) {
    return path.join(appPath.replace(/\.asar$/, '.asar.unpacked'), 'branding', 'icon-512.svg');
  }
  return path.join(appPath, 'branding', 'icon-512.svg');
}

/** Schedule a timer to fire at the next midnight for date rollover */
export function scheduleMidnightUpdate(callback: () => void) {
  onUpdateCallback = callback;
  clearMidnightTimer();

  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  const ms = midnight.getTime() - now.getTime();

  midnightTimer = setTimeout(() => {
    console.log('[Dagaz] Midnight rollover — updating dock icon');
    lastRenderedDate = ''; // force re-render
    callback();
    scheduleMidnightUpdate(callback); // schedule next
  }, ms);

  console.log(`[Dagaz] Next dock icon update in ${Math.round(ms / 60000)} min`);
}

/** Re-render after system wake (might have slept through midnight) */
export function handleSystemWake(callback: () => void) {
  const now = new Date();
  const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (!lastRenderedDate.startsWith(dateKey)) {
    console.log('[Dagaz] System wake — date changed, updating dock icon');
    lastRenderedDate = '';
    callback();
    scheduleMidnightUpdate(callback);
  }
}

/** Start periodic event indicator check */
export function startEventIndicatorCheck(
  getUpcomingInMinutes: (minutes: number) => number,
  minutes: number,
  onUpdate: (hasSoon: boolean) => void,
) {
  stopEventIndicatorCheck();
  eventCheckInterval = setInterval(() => {
    const count = getUpcomingInMinutes(minutes);
    onUpdate(count > 0);
  }, 30000); // check every 30s
  // Also check immediately
  const count = getUpcomingInMinutes(minutes);
  onUpdate(count > 0);
}

export function stopEventIndicatorCheck() {
  if (eventCheckInterval) {
    clearInterval(eventCheckInterval);
    eventCheckInterval = null;
  }
}

export function clearMidnightTimer() {
  if (midnightTimer) {
    clearTimeout(midnightTimer);
    midnightTimer = null;
  }
}

export function stopDockIcon() {
  clearMidnightTimer();
  stopEventIndicatorCheck();
}

/**
 * Touch Strip Renderer — renders VU meter on the Stream Deck Plus LCD strip.
 *
 * The touch strip is 800x100 pixels (divided into 4 slots of 200x100).
 * We render a full-width stereo VU meter with a classic analog look:
 *   - Segmented bar graph style with smooth fills
 *   - Left channel on top, right channel on bottom
 *   - Peak indicators and dB scale markings
 *   - Real-time needle/bar animation
 *
 * Each encoder slot (200x100) renders one quarter of the frequency range,
 * so across all 4 slots we get a seamless full-width meter.
 */

import { ColorTheme, getSegmentColor, dimColor, hexToRgb } from "../utils/color";
import { AudioLevels } from "../audio/audio-capture";
import { TOUCH_SLOT_WIDTH, TOUCH_SLOT_HEIGHT, SEGMENTS_TOUCH } from "../utils/constants";

const W = TOUCH_SLOT_WIDTH;
const H = TOUCH_SLOT_HEIGHT;

// Layout within a single slot
const BAR_HEIGHT = 28;
const TOP_BAR_Y = 14;
const BOTTOM_BAR_Y = H - BAR_HEIGHT - 14;
const LABEL_Y = H / 2 + 4;
const BAR_RADIUS = 3;

/**
 * Render a single encoder slot's portion of the VU meter.
 *
 * @param slotIndex - 0-3, which encoder slot this is
 * @param levels - current audio levels
 * @param theme - color theme
 * @param showPeaks - whether to display peak indicators
 * @returns SVG data URI for this slot
 */
export function renderTouchSlot(
  slotIndex: number,
  levels: AudioLevels,
  theme: ColorTheme,
  showPeaks = true,
): string {
  // Each slot covers 25% of the meter range
  const slotStart = slotIndex / 4;
  const slotEnd = (slotIndex + 1) / 4;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

  // Background
  svg += `<rect width="${W}" height="${H}" fill="${theme.background}"/>`;

  // Render segment bars for this slot
  const segmentsPerSlot = SEGMENTS_TOUCH / 4;
  const segWidth = (W - 8) / segmentsPerSlot;
  const gap = 2;

  // Left channel (top bar)
  svg += renderChannelBar(
    levels.left, levels.peakLeft, slotIndex, segmentsPerSlot, segWidth, gap,
    TOP_BAR_Y, BAR_HEIGHT, theme, showPeaks, "L", slotIndex === 0,
  );

  // Right channel (bottom bar)
  svg += renderChannelBar(
    levels.right, levels.peakRight, slotIndex, segmentsPerSlot, segWidth, gap,
    BOTTOM_BAR_Y, BAR_HEIGHT, theme, showPeaks, "R", slotIndex === 0,
  );

  // Center label (only on first slot)
  if (slotIndex === 0) {
    svg += `<text x="4" y="${LABEL_Y}" font-size="9" font-family="monospace" fill="${theme.text}" opacity="0.5">dB</text>`;
  }

  // dB scale ticks along the bottom of the meter
  const dbMarks = [-40, -30, -20, -10, -6, -3, 0];
  for (const db of dbMarks) {
    const normalized = dbToNormalized(db);
    if (normalized >= slotStart && normalized < slotEnd) {
      const x = ((normalized - slotStart) / (slotEnd - slotStart)) * W;
      svg += `<line x1="${x}" y1="${H / 2 - 5}" x2="${x}" y2="${H / 2 + 5}" stroke="${theme.text}" stroke-width="1" opacity="0.3"/>`;
      svg += `<text x="${x}" y="${LABEL_Y}" text-anchor="middle" font-size="7" font-family="monospace" fill="${theme.text}" opacity="0.4">${db}</text>`;
    }
  }

  svg += `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function renderChannelBar(
  level: number,
  peak: number,
  slotIndex: number,
  segmentsPerSlot: number,
  segWidth: number,
  gap: number,
  y: number,
  height: number,
  theme: ColorTheme,
  showPeaks: boolean,
  label: string,
  _showLabel: boolean,
): string {
  let svg = "";
  const startSeg = slotIndex * segmentsPerSlot;

  for (let i = 0; i < segmentsPerSlot; i++) {
    const globalSeg = startSeg + i;
    const segStart = globalSeg / SEGMENTS_TOUCH;
    const segEnd = (globalSeg + 1) / SEGMENTS_TOUCH;
    const x = 4 + i * segWidth;
    const w = segWidth - gap;

    const color = getSegmentColor(theme, globalSeg, SEGMENTS_TOUCH);
    const dimmed = dimColor(color, 0.12);

    if (level >= segEnd) {
      // Fully lit segment
      const rgb = hexToRgb(color);
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${height}" fill="${color}" rx="${BAR_RADIUS}"/>`;
      // Subtle inner glow
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${height}" fill="none" stroke="rgba(${rgb.r},${rgb.g},${rgb.b},0.4)" stroke-width="1" rx="${BAR_RADIUS}"/>`;
    } else if (level > segStart) {
      // Partially lit segment — this is the key innovation!
      const fillRatio = (level - segStart) / (segEnd - segStart);
      const fillWidth = w * fillRatio;
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${height}" fill="${dimmed}" rx="${BAR_RADIUS}"/>`;
      // Clip the fill to the bar shape
      svg += `<clipPath id="seg${globalSeg}${label}"><rect x="${x}" y="${y}" width="${w}" height="${height}" rx="${BAR_RADIUS}"/></clipPath>`;
      svg += `<rect x="${x}" y="${y}" width="${fillWidth}" height="${height}" fill="${color}" clip-path="url(#seg${globalSeg}${label})"/>`;
    } else {
      // Inactive segment
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${height}" fill="${dimmed}" rx="${BAR_RADIUS}"/>`;
    }

    // Peak indicator
    if (showPeaks && peak >= segStart && peak < segEnd) {
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${height}" fill="none" stroke="${theme.peak}" stroke-width="1.5" rx="${BAR_RADIUS}" opacity="0.8"/>`;
    }
  }

  return svg;
}

/**
 * Convert dB value to 0-1 normalized range.
 * Uses a typical audio metering scale.
 */
function dbToNormalized(db: number): number {
  // Map -60dB..0dB to 0..1 with a slight curve for better visual response
  const clamped = Math.max(-60, Math.min(0, db));
  return (clamped + 60) / 60;
}

/**
 * Render a compact single-slot VU meter for when only one encoder is used.
 * Shows both channels stacked vertically in a single 200x100 slot.
 */
export function renderCompactTouchSlot(
  levels: AudioLevels,
  theme: ColorTheme,
  _showPeaks = true,
): string {
  const segments = 16;
  const segWidth = (W - 8) / segments;
  const gap = 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="${theme.background}"/>`;

  // Left channel - top half
  for (let i = 0; i < segments; i++) {
    const segStart = i / segments;
    const segEnd = (i + 1) / segments;
    const x = 4 + i * segWidth;
    const w = segWidth - gap;
    const color = getSegmentColor(theme, i, segments);
    const dimmed = dimColor(color, 0.12);

    if (levels.left >= segEnd) {
      svg += `<rect x="${x}" y="8" width="${w}" height="34" fill="${color}" rx="2"/>`;
    } else if (levels.left > segStart) {
      const fillRatio = (levels.left - segStart) / (segEnd - segStart);
      svg += `<rect x="${x}" y="8" width="${w}" height="34" fill="${dimmed}" rx="2"/>`;
      svg += `<clipPath id="tl${i}"><rect x="${x}" y="8" width="${w}" height="34" rx="2"/></clipPath>`;
      svg += `<rect x="${x}" y="8" width="${w * fillRatio}" height="34" fill="${color}" clip-path="url(#tl${i})"/>`;
    } else {
      svg += `<rect x="${x}" y="8" width="${w}" height="34" fill="${dimmed}" rx="2"/>`;
    }
  }

  // Right channel - bottom half
  for (let i = 0; i < segments; i++) {
    const segStart = i / segments;
    const segEnd = (i + 1) / segments;
    const x = 4 + i * segWidth;
    const w = segWidth - gap;
    const color = getSegmentColor(theme, i, segments);
    const dimmed = dimColor(color, 0.12);

    if (levels.right >= segEnd) {
      svg += `<rect x="${x}" y="58" width="${w}" height="34" fill="${color}" rx="2"/>`;
    } else if (levels.right > segStart) {
      const fillRatio = (levels.right - segStart) / (segEnd - segStart);
      svg += `<rect x="${x}" y="58" width="${w}" height="34" fill="${dimmed}" rx="2"/>`;
      svg += `<clipPath id="tr${i}"><rect x="${x}" y="58" width="${w}" height="34" rx="2"/></clipPath>`;
      svg += `<rect x="${x}" y="58" width="${w * fillRatio}" height="34" fill="${color}" clip-path="url(#tr${i})"/>`;
    } else {
      svg += `<rect x="${x}" y="58" width="${w}" height="34" fill="${dimmed}" rx="2"/>`;
    }
  }

  // Channel labels
  svg += `<text x="2" y="30" font-size="7" font-family="monospace" fill="${theme.text}" opacity="0.5">L</text>`;
  svg += `<text x="2" y="80" font-size="7" font-family="monospace" fill="${theme.text}" opacity="0.5">R</text>`;

  // Divider line
  svg += `<line x1="0" y1="50" x2="${W}" y2="50" stroke="${theme.text}" stroke-width="0.5" opacity="0.2"/>`;

  svg += `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

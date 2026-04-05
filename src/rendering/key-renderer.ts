/**
 * SVG Key Renderer — the core visual innovation of this plugin.
 *
 * Instead of simple on/off solid-color keys, each key renders a gradient
 * fill bar that can show partial levels. This gives us much higher fidelity
 * than the original 8-segment binary display, despite having fewer keys.
 *
 * For example, 4 keys with 100 fill levels each = 400 effective levels
 * of resolution, compared to the original's 8 binary segments.
 *
 * Each key renders as a vertical bar with:
 *   - A dark background
 *   - A filled portion rising from the bottom, colored by segment position
 *   - Optional peak indicator line
 *   - Subtle segment tick marks for visual reference
 *   - A slight glow effect on the active portion
 */

import { ColorTheme, getSegmentColor, dimColor, hexToRgb } from "../utils/color";
import { KEY_SIZE } from "../utils/constants";

const SIZE = KEY_SIZE;
const PADDING = 6;
const BAR_RADIUS = 4;

/**
 * Render a single VU meter key as an SVG data URI.
 *
 * @param fillLevel  - 0.0 to 1.0, how full THIS key's bar is
 * @param segmentIdx - which segment this key represents (for color selection)
 * @param totalSegments - total number of segments in the display
 * @param theme - color theme to use
 * @param peakLevel - 0.0 to 1.0, where to draw peak indicator on THIS key (or -1 for none)
 * @param isActive - whether this segment should be lit at all
 */
export function renderKeyBar(
  fillLevel: number,
  segmentIdx: number,
  totalSegments: number,
  theme: ColorTheme,
  peakLevel = -1,
  isActive = true,
): string {
  const fill = Math.max(0, Math.min(1, fillLevel));
  const color = getSegmentColor(theme, segmentIdx, totalSegments);
  const dimmed = dimColor(color, 0.15);
  const barLeft = PADDING;
  const barTop = PADDING;
  const barWidth = SIZE - PADDING * 2;
  const barHeight = SIZE - PADDING * 2;

  // Fill height from bottom
  const fillHeight = barHeight * fill;
  const fillY = barTop + barHeight - fillHeight;

  // Glow color (lighter version)
  const rgb = hexToRgb(color);
  const glowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">`;

  // Definitions: gradient for the filled portion, glow filter
  svg += `<defs>`;
  svg += `<linearGradient id="fillGrad" x1="0" y1="1" x2="0" y2="0">`;
  svg += `<stop offset="0%" stop-color="${dimColor(color, 0.7)}"/>`;
  svg += `<stop offset="100%" stop-color="${color}"/>`;
  svg += `</linearGradient>`;
  svg += `<filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/>`;
  svg += `<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  svg += `<clipPath id="barClip"><rect x="${barLeft}" y="${barTop}" width="${barWidth}" height="${barHeight}" rx="${BAR_RADIUS}"/></clipPath>`;
  svg += `</defs>`;

  // Background
  svg += `<rect width="${SIZE}" height="${SIZE}" fill="${theme.background}" rx="8"/>`;

  // Bar background (inactive/dimmed)
  svg += `<rect x="${barLeft}" y="${barTop}" width="${barWidth}" height="${barHeight}" fill="${isActive ? dimmed : theme.inactive}" rx="${BAR_RADIUS}"/>`;

  if (fill > 0 && isActive) {
    // Filled portion with gradient
    svg += `<g clip-path="url(#barClip)">`;
    svg += `<rect x="${barLeft}" y="${fillY}" width="${barWidth}" height="${fillHeight}" fill="url(#fillGrad)"/>`;

    // Subtle horizontal segment lines within the bar
    const numTicks = 8;
    for (let i = 1; i < numTicks; i++) {
      const tickY = barTop + (barHeight / numTicks) * i;
      if (tickY >= fillY) {
        svg += `<line x1="${barLeft}" y1="${tickY}" x2="${barLeft + barWidth}" y2="${tickY}" stroke="${theme.background}" stroke-opacity="0.3" stroke-width="1"/>`;
      }
    }

    // Top edge glow line
    if (fillHeight > 2) {
      svg += `<rect x="${barLeft}" y="${fillY}" width="${barWidth}" height="3" fill="${color}" opacity="0.9"/>`;
    }

    svg += `</g>`;

    // Outer glow effect on the filled region
    svg += `<rect x="${barLeft - 1}" y="${fillY}" width="${barWidth + 2}" height="${fillHeight}" fill="none" stroke="${glowColor}" stroke-width="2" rx="${BAR_RADIUS}" filter="url(#glow)" opacity="0.5"/>`;
  }

  // Peak indicator
  if (peakLevel >= 0 && peakLevel <= 1 && isActive) {
    const peakY = barTop + barHeight - barHeight * Math.max(0, Math.min(1, peakLevel));
    svg += `<line x1="${barLeft + 2}" y1="${peakY}" x2="${barLeft + barWidth - 2}" y2="${peakY}" stroke="${theme.peak}" stroke-width="2" opacity="0.9"/>`;
  }

  svg += `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Render a single VU meter key as a horizontal bar SVG data URI.
 * The bar fills left-to-right instead of bottom-to-top.
 */
export function renderHorizontalKeyBar(
  fillLevel: number,
  segmentIdx: number,
  totalSegments: number,
  theme: ColorTheme,
  peakLevel = -1,
  isActive = true,
): string {
  const fill = Math.max(0, Math.min(1, fillLevel));
  const color = getSegmentColor(theme, segmentIdx, totalSegments);
  const dimmed = dimColor(color, 0.15);
  const barLeft = PADDING;
  const barTop = PADDING;
  const barWidth = SIZE - PADDING * 2;
  const barHeight = SIZE - PADDING * 2;

  // Fill width from left
  const fillWidth = barWidth * fill;

  // Glow color
  const rgb = hexToRgb(color);
  const glowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">`;

  svg += `<defs>`;
  svg += `<linearGradient id="fillGrad" x1="0" y1="0" x2="1" y2="0">`;
  svg += `<stop offset="0%" stop-color="${dimColor(color, 0.7)}"/>`;
  svg += `<stop offset="100%" stop-color="${color}"/>`;
  svg += `</linearGradient>`;
  svg += `<filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/>`;
  svg += `<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  svg += `<clipPath id="barClip"><rect x="${barLeft}" y="${barTop}" width="${barWidth}" height="${barHeight}" rx="${BAR_RADIUS}"/></clipPath>`;
  svg += `</defs>`;

  // Background
  svg += `<rect width="${SIZE}" height="${SIZE}" fill="${theme.background}" rx="8"/>`;

  // Bar background
  svg += `<rect x="${barLeft}" y="${barTop}" width="${barWidth}" height="${barHeight}" fill="${isActive ? dimmed : theme.inactive}" rx="${BAR_RADIUS}"/>`;

  if (fill > 0 && isActive) {
    svg += `<g clip-path="url(#barClip)">`;
    svg += `<rect x="${barLeft}" y="${barTop}" width="${fillWidth}" height="${barHeight}" fill="url(#fillGrad)"/>`;

    // Vertical tick marks
    const numTicks = 8;
    for (let i = 1; i < numTicks; i++) {
      const tickX = barLeft + (barWidth / numTicks) * i;
      if (tickX <= barLeft + fillWidth) {
        svg += `<line x1="${tickX}" y1="${barTop}" x2="${tickX}" y2="${barTop + barHeight}" stroke="${theme.background}" stroke-opacity="0.3" stroke-width="1"/>`;
      }
    }

    // Right edge glow line
    if (fillWidth > 2) {
      svg += `<rect x="${barLeft + fillWidth - 3}" y="${barTop}" width="3" height="${barHeight}" fill="${color}" opacity="0.9"/>`;
    }

    svg += `</g>`;

    // Outer glow
    svg += `<rect x="${barLeft}" y="${barTop - 1}" width="${fillWidth}" height="${barHeight + 2}" fill="none" stroke="${glowColor}" stroke-width="2" rx="${BAR_RADIUS}" filter="url(#glow)" opacity="0.5"/>`;
  }

  // Peak indicator (vertical line)
  if (peakLevel >= 0 && peakLevel <= 1 && isActive) {
    const peakX = barLeft + barWidth * Math.max(0, Math.min(1, peakLevel));
    svg += `<line x1="${peakX}" y1="${barTop + 2}" x2="${peakX}" y2="${barTop + barHeight - 2}" stroke="${theme.peak}" stroke-width="2" opacity="0.9"/>`;
  }

  svg += `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Render a split L/R key for One-Row mode.
 * The key is divided vertically: left half = left channel, right half = right channel.
 */
export function renderSplitKeyBar(
  leftFill: number,
  rightFill: number,
  segmentIdx: number,
  totalSegments: number,
  theme: ColorTheme,
  peakLeft = -1,
  peakRight = -1,
): string {
  const lFill = Math.max(0, Math.min(1, leftFill));
  const rFill = Math.max(0, Math.min(1, rightFill));
  const color = getSegmentColor(theme, segmentIdx, totalSegments);
  const dimmed = dimColor(color, 0.15);

  const halfWidth = (SIZE - PADDING * 2 - 4) / 2; // 4px gap between L and R
  const barHeight = SIZE - PADDING * 2;
  const barTop = PADDING;
  const leftX = PADDING;
  const rightX = PADDING + halfWidth + 4;

  const lFillH = barHeight * lFill;
  const rFillH = barHeight * rFill;
  const lFillY = barTop + barHeight - lFillH;
  const rFillY = barTop + barHeight - rFillH;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">`;

  svg += `<defs>`;
  svg += `<linearGradient id="fg" x1="0" y1="1" x2="0" y2="0">`;
  svg += `<stop offset="0%" stop-color="${dimColor(color, 0.7)}"/>`;
  svg += `<stop offset="100%" stop-color="${color}"/>`;
  svg += `</linearGradient>`;
  svg += `<filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  svg += `</defs>`;

  // Background
  svg += `<rect width="${SIZE}" height="${SIZE}" fill="${theme.background}" rx="8"/>`;

  // Left bar background
  svg += `<rect x="${leftX}" y="${barTop}" width="${halfWidth}" height="${barHeight}" fill="${dimmed}" rx="${BAR_RADIUS}"/>`;
  // Right bar background
  svg += `<rect x="${rightX}" y="${barTop}" width="${halfWidth}" height="${barHeight}" fill="${dimmed}" rx="${BAR_RADIUS}"/>`;

  // Left fill
  if (lFill > 0) {
    svg += `<clipPath id="lc"><rect x="${leftX}" y="${barTop}" width="${halfWidth}" height="${barHeight}" rx="${BAR_RADIUS}"/></clipPath>`;
    svg += `<g clip-path="url(#lc)">`;
    svg += `<rect x="${leftX}" y="${lFillY}" width="${halfWidth}" height="${lFillH}" fill="url(#fg)"/>`;
    if (lFillH > 2) svg += `<rect x="${leftX}" y="${lFillY}" width="${halfWidth}" height="2" fill="${color}" opacity="0.9"/>`;
    svg += `</g>`;
  }

  // Right fill
  if (rFill > 0) {
    svg += `<clipPath id="rc"><rect x="${rightX}" y="${barTop}" width="${halfWidth}" height="${barHeight}" rx="${BAR_RADIUS}"/></clipPath>`;
    svg += `<g clip-path="url(#rc)">`;
    svg += `<rect x="${rightX}" y="${rFillY}" width="${halfWidth}" height="${rFillH}" fill="url(#fg)"/>`;
    if (rFillH > 2) svg += `<rect x="${rightX}" y="${rFillY}" width="${halfWidth}" height="2" fill="${color}" opacity="0.9"/>`;
    svg += `</g>`;
  }

  // Peak indicators
  if (peakLeft >= 0 && peakLeft <= 1) {
    const py = barTop + barHeight - barHeight * peakLeft;
    svg += `<line x1="${leftX + 2}" y1="${py}" x2="${leftX + halfWidth - 2}" y2="${py}" stroke="${theme.peak}" stroke-width="1.5" opacity="0.8"/>`;
  }
  if (peakRight >= 0 && peakRight <= 1) {
    const py = barTop + barHeight - barHeight * peakRight;
    svg += `<line x1="${rightX + 2}" y1="${py}" x2="${rightX + halfWidth - 2}" y2="${py}" stroke="${theme.peak}" stroke-width="1.5" opacity="0.8"/>`;
  }

  // Channel labels at bottom
  svg += `<text x="${leftX + halfWidth / 2}" y="${SIZE - 1}" text-anchor="middle" font-size="8" font-family="monospace" fill="${theme.text}" opacity="0.6">L</text>`;
  svg += `<text x="${rightX + halfWidth / 2}" y="${SIZE - 1}" text-anchor="middle" font-size="8" font-family="monospace" fill="${theme.text}" opacity="0.6">R</text>`;

  svg += `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Render a horizontal split L/R key for One-Row mode.
 * The key is divided horizontally: top half = left channel, bottom half = right channel.
 * Both bars fill left-to-right.
 */
export function renderHorizontalSplitKeyBar(
  leftFill: number,
  rightFill: number,
  segmentIdx: number,
  totalSegments: number,
  theme: ColorTheme,
  peakLeft = -1,
  peakRight = -1,
): string {
  const lFill = Math.max(0, Math.min(1, leftFill));
  const rFill = Math.max(0, Math.min(1, rightFill));
  const color = getSegmentColor(theme, segmentIdx, totalSegments);
  const dimmed = dimColor(color, 0.15);

  const barWidth = SIZE - PADDING * 2;
  const halfHeight = (SIZE - PADDING * 2 - 4) / 2; // 4px gap between L and R
  const topY = PADDING;
  const bottomY = PADDING + halfHeight + 4;
  const barLeft = PADDING;

  const lFillW = barWidth * lFill;
  const rFillW = barWidth * rFill;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">`;

  svg += `<defs>`;
  svg += `<linearGradient id="fg" x1="0" y1="0" x2="1" y2="0">`;
  svg += `<stop offset="0%" stop-color="${dimColor(color, 0.7)}"/>`;
  svg += `<stop offset="100%" stop-color="${color}"/>`;
  svg += `</linearGradient>`;
  svg += `<filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  svg += `</defs>`;

  // Background
  svg += `<rect width="${SIZE}" height="${SIZE}" fill="${theme.background}" rx="8"/>`;

  // Top bar background (left channel)
  svg += `<rect x="${barLeft}" y="${topY}" width="${barWidth}" height="${halfHeight}" fill="${dimmed}" rx="${BAR_RADIUS}"/>`;
  // Bottom bar background (right channel)
  svg += `<rect x="${barLeft}" y="${bottomY}" width="${barWidth}" height="${halfHeight}" fill="${dimmed}" rx="${BAR_RADIUS}"/>`;

  // Left channel fill (top, left-to-right)
  if (lFill > 0) {
    svg += `<clipPath id="lc"><rect x="${barLeft}" y="${topY}" width="${barWidth}" height="${halfHeight}" rx="${BAR_RADIUS}"/></clipPath>`;
    svg += `<g clip-path="url(#lc)">`;
    svg += `<rect x="${barLeft}" y="${topY}" width="${lFillW}" height="${halfHeight}" fill="url(#fg)"/>`;
    if (lFillW > 2) svg += `<rect x="${barLeft + lFillW - 2}" y="${topY}" width="2" height="${halfHeight}" fill="${color}" opacity="0.9"/>`;
    svg += `</g>`;
  }

  // Right channel fill (bottom, left-to-right)
  if (rFill > 0) {
    svg += `<clipPath id="rc"><rect x="${barLeft}" y="${bottomY}" width="${barWidth}" height="${halfHeight}" rx="${BAR_RADIUS}"/></clipPath>`;
    svg += `<g clip-path="url(#rc)">`;
    svg += `<rect x="${barLeft}" y="${bottomY}" width="${rFillW}" height="${halfHeight}" fill="url(#fg)"/>`;
    if (rFillW > 2) svg += `<rect x="${barLeft + rFillW - 2}" y="${bottomY}" width="2" height="${halfHeight}" fill="${color}" opacity="0.9"/>`;
    svg += `</g>`;
  }

  // Peak indicators (vertical lines)
  if (peakLeft >= 0 && peakLeft <= 1) {
    const px = barLeft + barWidth * peakLeft;
    svg += `<line x1="${px}" y1="${topY + 2}" x2="${px}" y2="${topY + halfHeight - 2}" stroke="${theme.peak}" stroke-width="1.5" opacity="0.8"/>`;
  }
  if (peakRight >= 0 && peakRight <= 1) {
    const px = barLeft + barWidth * peakRight;
    svg += `<line x1="${px}" y1="${bottomY + 2}" x2="${px}" y2="${bottomY + halfHeight - 2}" stroke="${theme.peak}" stroke-width="1.5" opacity="0.8"/>`;
  }

  // Channel labels on left edge
  svg += `<text x="${barLeft + 4}" y="${topY + halfHeight / 2 + 3}" font-size="8" font-family="monospace" fill="${theme.text}" opacity="0.6">L</text>`;
  svg += `<text x="${barLeft + 4}" y="${bottomY + halfHeight / 2 + 3}" font-size="8" font-family="monospace" fill="${theme.text}" opacity="0.6">R</text>`;

  svg += `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

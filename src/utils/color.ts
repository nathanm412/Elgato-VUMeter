/**
 * Color utilities for VU meter segment rendering.
 *
 * Segment colors follow the classic VU meter convention:
 *   Green (safe) -> Yellow (caution) -> Red (clipping)
 *
 * Colors are defined as hex strings for SVG compatibility.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface ColorTheme {
  name: string;
  segments: string[];  // hex colors from low to high
  background: string;
  inactive: string;    // dimmed segment color
  peak: string;
  text: string;
}

export const THEMES: Record<string, ColorTheme> = {
  classic: {
    name: "Classic",
    segments: ["#00CC00", "#00DD00", "#00EE00", "#CCDD00", "#FFCC00", "#FF6600", "#FF2200", "#FF0000"],
    background: "#0A0A0A",
    inactive: "#1A2A1A",
    peak: "#FFFFFF",
    text: "#AAAAAA",
  },
  blue: {
    name: "Cool Blue",
    segments: ["#0044CC", "#0066DD", "#0088EE", "#00AAFF", "#00CCFF", "#44DDFF", "#FF8800", "#FF2200"],
    background: "#050510",
    inactive: "#0A1020",
    peak: "#FFFFFF",
    text: "#8888CC",
  },
  purple: {
    name: "Synthwave",
    segments: ["#6600CC", "#8800DD", "#AA00EE", "#CC00FF", "#DD44FF", "#FF44CC", "#FF2288", "#FF0044"],
    background: "#0A0510",
    inactive: "#150A20",
    peak: "#FFFF00",
    text: "#CC88FF",
  },
  warm: {
    name: "Warm",
    segments: ["#FF6600", "#FF7700", "#FF8800", "#FF9900", "#FFAA00", "#FFBB00", "#FF4400", "#FF0000"],
    background: "#0A0800",
    inactive: "#1A1208",
    peak: "#FFFFFF",
    text: "#CC9966",
  },
};

export const THEME_ORDER = ["classic", "blue", "purple", "warm"];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

export function rgbToHex(rgb: RGB): string {
  const r = Math.max(0, Math.min(255, Math.round(rgb.r)));
  const g = Math.max(0, Math.min(255, Math.round(rgb.g)));
  const b = Math.max(0, Math.min(255, Math.round(rgb.b)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function dimColor(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  return rgbToHex({
    r: rgb.r * factor,
    g: rgb.g * factor,
    b: rgb.b * factor,
  });
}

export function interpolateColor(hex1: string, hex2: string, t: number): string {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  return rgbToHex({
    r: c1.r + (c2.r - c1.r) * t,
    g: c1.g + (c2.g - c1.g) * t,
    b: c1.b + (c2.b - c1.b) * t,
  });
}

/**
 * Get the color for a given segment index based on the theme.
 * segmentCount allows mapping to themes with different numbers of defined colors.
 */
export function getSegmentColor(theme: ColorTheme, segmentIndex: number, totalSegments: number): string {
  if (totalSegments <= 1) {
    return theme.segments[Math.floor(theme.segments.length / 2)];
  }
  const ratio = segmentIndex / (totalSegments - 1);
  const idx = ratio * (theme.segments.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return theme.segments[lo];
  const t = idx - lo;
  return interpolateColor(theme.segments[lo], theme.segments[hi], t);
}

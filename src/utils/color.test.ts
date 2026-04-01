import { hexToRgb, rgbToHex, dimColor, interpolateColor, getSegmentColor, THEMES } from "./color";

describe("hexToRgb", () => {
  it("converts hex to RGB", () => {
    expect(hexToRgb("#FF0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb("#00FF00")).toEqual({ r: 0, g: 255, b: 0 });
    expect(hexToRgb("#0000FF")).toEqual({ r: 0, g: 0, b: 255 });
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("handles without hash", () => {
    expect(hexToRgb("FF0000")).toEqual({ r: 255, g: 0, b: 0 });
  });
});

describe("rgbToHex", () => {
  it("converts RGB to hex", () => {
    expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe("#ff0000");
    expect(rgbToHex({ r: 0, g: 255, b: 0 })).toBe("#00ff00");
  });

  it("clamps values", () => {
    expect(rgbToHex({ r: 300, g: -10, b: 128 })).toBe("#ff0080");
  });
});

describe("dimColor", () => {
  it("dims a color by factor", () => {
    const result = dimColor("#FF0000", 0.5);
    expect(hexToRgb(result)).toEqual({ r: 128, g: 0, b: 0 });
  });

  it("returns black at factor 0", () => {
    expect(dimColor("#FFFFFF", 0)).toBe("#000000");
  });
});

describe("interpolateColor", () => {
  it("returns first color at t=0", () => {
    expect(interpolateColor("#FF0000", "#00FF00", 0)).toBe("#ff0000");
  });

  it("returns second color at t=1", () => {
    expect(interpolateColor("#FF0000", "#00FF00", 1)).toBe("#00ff00");
  });

  it("returns midpoint at t=0.5", () => {
    const mid = interpolateColor("#000000", "#FFFFFF", 0.5);
    const rgb = hexToRgb(mid);
    expect(rgb.r).toBeCloseTo(128, 0);
    expect(rgb.g).toBeCloseTo(128, 0);
    expect(rgb.b).toBeCloseTo(128, 0);
  });
});

describe("getSegmentColor", () => {
  it("returns first segment color at index 0", () => {
    const theme = THEMES.classic;
    const color = getSegmentColor(theme, 0, 8);
    expect(color).toBe(theme.segments[0]);
  });

  it("returns last segment color at max index", () => {
    const theme = THEMES.classic;
    const color = getSegmentColor(theme, 7, 8);
    expect(color).toBe(theme.segments[7]);
  });

  it("interpolates for non-matching segment counts", () => {
    const theme = THEMES.classic;
    const color = getSegmentColor(theme, 1, 4);
    // Should be an interpolated value, not crash
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("themes", () => {
  it("all themes have 8 segment colors", () => {
    for (const [, theme] of Object.entries(THEMES)) {
      expect(theme.segments).toHaveLength(8);
      expect(theme.name).toBeTruthy();
      expect(theme.background).toMatch(/^#/);
    }
  });
});

import { renderKeyBar, renderSplitKeyBar } from "./key-renderer";
import { THEMES } from "../utils/color";

const theme = THEMES.classic;

describe("renderKeyBar", () => {
  it("returns a data URI SVG string", () => {
    const result = renderKeyBar(0.5, 0, 4, theme);
    expect(result).toMatch(/^data:image\/svg\+xml,/);
    expect(result).toContain("svg");
  });

  it("renders empty bar at fill=0", () => {
    const result = renderKeyBar(0, 0, 4, theme);
    expect(result).toContain("svg");
  });

  it("renders full bar at fill=1", () => {
    const result = renderKeyBar(1.0, 0, 4, theme);
    expect(result).toContain("fillGrad");
  });

  it("clamps fill level to 0-1 range", () => {
    const over = renderKeyBar(1.5, 0, 4, theme);
    const under = renderKeyBar(-0.5, 0, 4, theme);
    expect(over).toContain("svg");
    expect(under).toContain("svg");
  });

  it("includes peak indicator when specified", () => {
    const result = renderKeyBar(0.5, 0, 4, theme, 0.8);
    // Peak line should be present
    expect(result).toContain("stroke");
  });

  it("renders different colors for different segments", () => {
    const seg0 = renderKeyBar(1.0, 0, 4, theme);
    const seg3 = renderKeyBar(1.0, 3, 4, theme);
    // They should have different gradient colors
    expect(seg0).not.toBe(seg3);
  });
});

describe("renderSplitKeyBar", () => {
  it("returns a data URI SVG string", () => {
    const result = renderSplitKeyBar(0.5, 0.7, 0, 4, theme);
    expect(result).toMatch(/^data:image\/svg\+xml,/);
  });

  it("includes L and R labels", () => {
    const result = decodeURIComponent(renderSplitKeyBar(0.5, 0.5, 0, 4, theme));
    expect(result).toContain(">L<");
    expect(result).toContain(">R<");
  });

  it("handles zero levels", () => {
    const result = renderSplitKeyBar(0, 0, 0, 4, theme);
    expect(result).toContain("svg");
  });
});

/**
 * One-Row VU Meter Action
 *
 * Uses keys in a single row on any Stream Deck model.
 * Each key is split: left half = L channel, right half = R channel
 * (vertical mode) or top half = L, bottom half = R (horizontal mode).
 *
 * Dynamically detects how many keys the user has placed and adapts
 * the segment count accordingly.
 *
 * Key layout (vertical mode):
 *   [L|R 1] [L|R 2] [L|R 3] [L|R 4] ...
 */

import streamDeck, {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { renderSplitKeyBar, renderHorizontalSplitKeyBar, renderSolidSplitKeyBar } from "../rendering/key-renderer";
import type { DisplayStyle } from "../rendering/key-renderer";
import { AudioLevels } from "../audio/audio-capture";
import { THEMES, THEME_ORDER } from "../utils/color";
import type { JsonValue } from "@elgato/utils";

interface OneRowSettings {
  theme: string;
  showPeaks: boolean;
  orientation: "vertical" | "horizontal";
  displayStyle: DisplayStyle;
  sensitivityTuning: string;
  [key: string]: JsonValue;
}

const DEFAULT_SETTINGS: OneRowSettings = {
  theme: "classic",
  showPeaks: true,
  orientation: "horizontal",
  displayStyle: "gradient",
  sensitivityTuning: "default",
};

interface ActionContext {
  context: string;
  column: number;
  settings: OneRowSettings;
}

@action({ UUID: "com.nathanm412.vumeter.one-row" })
export class VUMeterOneRow extends SingletonAction<OneRowSettings> {
  private contexts: Map<string, ActionContext> = new Map();
  private lastImages: Map<string, string> = new Map();
  private onSettingsChanged: ((settings: OneRowSettings) => void) | null = null;

  setOnSettingsChanged(cb: (settings: OneRowSettings) => void): void {
    this.onSettingsChanged = cb;
  }
  private totalSegments = 1;
  private minColumn = 0;

  private computeSegmentInfo(): void {
    if (this.contexts.size === 0) {
      this.totalSegments = 1;
      this.minColumn = 0;
      return;
    }

    const columns: number[] = [];
    for (const ctx of this.contexts.values()) {
      columns.push(ctx.column);
    }

    const oldSegments = this.totalSegments;
    this.minColumn = Math.min(...columns);
    this.totalSegments = Math.max(...columns) - this.minColumn + 1;

    if (oldSegments !== this.totalSegments) {
      this.lastImages.clear();
    }
  }

  override async onWillAppear(ev: WillAppearEvent<OneRowSettings>): Promise<void> {
    const settings = { ...DEFAULT_SETTINGS, ...ev.payload.settings };
    const coords = (ev.payload as Record<string, unknown>).coordinates as { row: number; column: number } | undefined;
    if (!coords) return;

    const ctx: ActionContext = {
      context: ev.action.id,
      column: coords.column,
      settings,
    };
    this.contexts.set(ev.action.id, ctx);
    this.computeSegmentInfo();

    const theme = THEMES[settings.theme] || THEMES.classic;
    const segIdx = coords.column - this.minColumn;
    const renderFn = settings.orientation === "horizontal" ? renderHorizontalSplitKeyBar : renderSplitKeyBar;
    const img = renderFn(0, 0, segIdx, this.totalSegments, theme);
    await ev.action.setImage(img);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<OneRowSettings>): Promise<void> {
    const ctx = this.contexts.get(ev.action.id);
    if (!ctx) return;
    const newSettings = { ...DEFAULT_SETTINGS, ...ev.payload.settings };
    ctx.settings = newSettings;

    // Global sync: apply settings to all sibling contexts
    for (const [otherId, otherCtx] of this.contexts) {
      if (otherId === ev.action.id) continue;
      otherCtx.settings = { ...newSettings };
      try {
        const action = streamDeck.actions.find((a) => a.id === otherId);
        if (action) {
          await action.setSettings(newSettings);
        }
      } catch {
        // Action may have been removed
      }
    }

    // Force full re-render
    this.lastImages.clear();

    // Notify plugin of settings change (e.g., sensitivity tuning)
    this.onSettingsChanged?.(newSettings);
  }

  override async onWillDisappear(ev: WillDisappearEvent<OneRowSettings>): Promise<void> {
    this.contexts.delete(ev.action.id);
    this.lastImages.delete(ev.action.id);
    this.computeSegmentInfo();
  }

  override async onKeyDown(ev: KeyDownEvent<OneRowSettings>): Promise<void> {
    const ctx = this.contexts.get(ev.action.id);
    if (!ctx) return;

    const currentIdx = THEME_ORDER.indexOf(ctx.settings.theme);
    const nextIdx = (currentIdx + 1) % THEME_ORDER.length;
    ctx.settings.theme = THEME_ORDER[nextIdx];

    await ev.action.setSettings(ctx.settings);
  }

  async updateLevels(levels: AudioLevels): Promise<void> {
    const calcFill = (level: number, start: number, end: number) => {
      if (level >= end) return 1.0;
      if (level > start) return (level - start) / (end - start);
      return 0;
    };

    const calcPeak = (peak: number, start: number, end: number) => {
      if (peak >= start && peak < end) {
        return (peak - start) / (end - start);
      }
      return -1;
    };

    for (const [id, ctx] of this.contexts) {
      const theme = THEMES[ctx.settings.theme] || THEMES.classic;
      const segIdx = ctx.column - this.minColumn;
      const isHorizontal = ctx.settings.orientation === "horizontal";
      const isSolid = ctx.settings.displayStyle === "solid";

      const segStart = segIdx / this.totalSegments;
      const segEnd = (segIdx + 1) / this.totalSegments;

      let img: string;

      if (isSolid) {
        const leftLit = levels.left >= segEnd || levels.left > segStart;
        const rightLit = levels.right >= segEnd || levels.right > segStart;
        const leftIsPeak = ctx.settings.showPeaks && levels.peakLeft >= segStart && levels.peakLeft < segEnd;
        const rightIsPeak = ctx.settings.showPeaks && levels.peakRight >= segStart && levels.peakRight < segEnd;
        img = renderSolidSplitKeyBar(leftLit, rightLit, segIdx, this.totalSegments, theme, !leftLit && leftIsPeak, !rightLit && rightIsPeak);
      } else {
        const leftFill = calcFill(levels.left, segStart, segEnd);
        const rightFill = calcFill(levels.right, segStart, segEnd);
        const peakL = ctx.settings.showPeaks ? calcPeak(levels.peakLeft, segStart, segEnd) : -1;
        const peakR = ctx.settings.showPeaks ? calcPeak(levels.peakRight, segStart, segEnd) : -1;

        const renderFn = isHorizontal ? renderHorizontalSplitKeyBar : renderSplitKeyBar;
        img = renderFn(leftFill, rightFill, segIdx, this.totalSegments, theme, peakL, peakR);
      }

      const lastImg = this.lastImages.get(id);
      if (img !== lastImg) {
        this.lastImages.set(id, img);
        try {
          const action = streamDeck.actions.find((a) => a.id === id);
          if (action) {
            await action.setImage(img);
          }
        } catch {
          // Action may have been removed
        }
      }
    }
  }

  getContextCount(): number {
    return this.contexts.size;
  }

  async setTheme(theme: string): Promise<void> {
    for (const [id, ctx] of this.contexts) {
      ctx.settings.theme = theme;
      try {
        const action = streamDeck.actions.find((a) => a.id === id);
        if (action) {
          await action.setSettings(ctx.settings);
        }
      } catch {
        // Action may have been removed
      }
    }
    this.lastImages.clear();
  }
}

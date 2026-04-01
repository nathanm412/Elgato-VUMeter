/**
 * One-Row VU Meter Action
 *
 * Uses 4 keys in a single row of the Stream Deck Plus.
 * Each key is split vertically: left half = L channel, right half = R channel.
 *
 * This mode is useful when you want to use the other row for different actions.
 *
 * Key layout:
 *   [L|R 1] [L|R 2] [L|R 3] [L|R 4]
 *
 * Each half-bar renders with gradient fill for high fidelity.
 */

import streamDeck, {
  action,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { renderSplitKeyBar } from "../rendering/key-renderer";
import { AudioLevels } from "../audio/audio-capture";
import { THEMES, THEME_ORDER } from "../utils/color";
import { SEGMENTS_ONE_ROW } from "../utils/constants";
import type { JsonValue } from "@elgato/utils";

interface OneRowSettings {
  theme: string;
  showPeaks: boolean;
  [key: string]: JsonValue;
}

const DEFAULT_SETTINGS: OneRowSettings = {
  theme: "classic",
  showPeaks: true,
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

    const theme = THEMES[settings.theme] || THEMES.classic;
    const img = renderSplitKeyBar(0, 0, coords.column, SEGMENTS_ONE_ROW, theme);
    await ev.action.setImage(img);
  }

  override async onWillDisappear(ev: WillDisappearEvent<OneRowSettings>): Promise<void> {
    this.contexts.delete(ev.action.id);
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
    // Define helpers outside the loop to avoid re-allocating memory ~20 times a second
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
      const segIdx = ctx.column;

      const segStart = segIdx / SEGMENTS_ONE_ROW;
      const segEnd = (segIdx + 1) / SEGMENTS_ONE_ROW;

      const leftFill = calcFill(levels.left, segStart, segEnd);
      const rightFill = calcFill(levels.right, segStart, segEnd);
      const peakL = ctx.settings.showPeaks ? calcPeak(levels.peakLeft, segStart, segEnd) : -1;
      const peakR = ctx.settings.showPeaks ? calcPeak(levels.peakRight, segStart, segEnd) : -1;

      const img = renderSplitKeyBar(leftFill, rightFill, segIdx, SEGMENTS_ONE_ROW, theme, peakL, peakR);

      const lastImg = this.lastImages.get(id);
      if (img !== lastImg) {
        this.lastImages.set(id, img);
        try {
          // Find the specific action instance by its ID to update its image
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
}

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
import { ColorTheme, THEMES, THEME_ORDER } from "../utils/color";
import { SEGMENTS_ONE_ROW } from "../utils/constants";

interface OneRowSettings {
  theme: string;
  showPeaks: boolean;
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
    const coords = ev.payload.coordinates;
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
    for (const [id, ctx] of this.contexts) {
      const theme = THEMES[ctx.settings.theme] || THEMES.classic;
      const segIdx = ctx.column;

      const segStart = segIdx / SEGMENTS_ONE_ROW;
      const segEnd = (segIdx + 1) / SEGMENTS_ONE_ROW;

      const calcFill = (level: number) => {
        if (level >= segEnd) return 1.0;
        if (level > segStart) return (level - segStart) / (segEnd - segStart);
        return 0;
      };

      const calcPeak = (peak: number) => {
        if (peak >= segStart && peak < segEnd) {
          return (peak - segStart) / (segEnd - segStart);
        }
        return -1;
      };

      const leftFill = calcFill(levels.left);
      const rightFill = calcFill(levels.right);
      const peakL = ctx.settings.showPeaks ? calcPeak(levels.peakLeft) : -1;
      const peakR = ctx.settings.showPeaks ? calcPeak(levels.peakRight) : -1;

      const img = renderSplitKeyBar(leftFill, rightFill, segIdx, SEGMENTS_ONE_ROW, theme, peakL, peakR);

      const lastImg = this.lastImages.get(id);
      if (img !== lastImg) {
        this.lastImages.set(id, img);
        try {
          await this.setImage(img, ctx);
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



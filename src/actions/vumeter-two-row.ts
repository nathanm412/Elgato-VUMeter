/**
 * Two-Row VU Meter Action
 *
 * Uses all 8 keys of the Stream Deck Plus (2 rows × 4 columns).
 * Top row (keys 0-3) = Left channel
 * Bottom row (keys 4-7) = Right channel
 *
 * Each key renders a vertical bar with gradient fill, so 4 keys per channel
 * with continuous fill levels gives us far more resolution than the original
 * 8-segment binary display.
 *
 * Key layout on Stream Deck Plus:
 *   [L1] [L2] [L3] [L4]    <- Left channel, low to high
 *   [R1] [R2] [R3] [R4]    <- Right channel, low to high
 */

import streamDeck, {
	action,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import {renderKeyBar} from "../rendering/key-renderer";
import {AudioLevels} from "../audio/audio-capture";
import {THEMES, THEME_ORDER} from "../utils/color";
import {SEGMENTS_TWO_ROW} from "../utils/constants";
import type {JsonValue} from "@elgato/utils";

interface TwoRowSettings {
	theme: string;
	showPeaks: boolean;
	peakHold: boolean;
	[key: string]: JsonValue;
}

const DEFAULT_SETTINGS: TwoRowSettings = {
	theme: "classic",
	showPeaks: true,
	peakHold: true,
};

interface ActionContext {
	context: string;
	row: number;    // 0 = top (left), 1 = bottom (right)
	column: number; // 0-3
	settings: TwoRowSettings;
}

@action({ UUID: "com.nathanm412.vumeter.two-row" })
export class VUMeterTwoRow extends SingletonAction<TwoRowSettings> {
	private contexts: Map<string, ActionContext> = new Map();
	private lastImages: Map<string, string> = new Map();

	override async onWillAppear(ev: WillAppearEvent<TwoRowSettings>): Promise<void> {
		const settings = {...DEFAULT_SETTINGS, ...ev.payload.settings};
		const coords = (ev.payload as Record<string, unknown>).coordinates as { row: number; column: number } | undefined;
		if (!coords) return;

		const ctx: ActionContext = {
			context: ev.action.id,
			row: coords.row,
			column: coords.column,
			settings,
		};
		this.contexts.set(ev.action.id, ctx);

		// Set initial dark state
		const theme = THEMES[settings.theme] || THEMES.classic;
		const segIdx = coords.column;
		const img = renderKeyBar(0, segIdx, SEGMENTS_TWO_ROW, theme, -1, false);
		await ev.action.setImage(img);
	}

	override async onWillDisappear(ev: WillDisappearEvent<TwoRowSettings>): Promise<void> {
		this.contexts.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<TwoRowSettings>): Promise<void> {
		// Cycle through themes on key press
		const ctx = this.contexts.get(ev.action.id);
		if (!ctx) return;

		const currentIdx = THEME_ORDER.indexOf(ctx.settings.theme);
		const nextIdx = (currentIdx + 1) % THEME_ORDER.length;
		ctx.settings.theme = THEME_ORDER[nextIdx];

		await ev.action.setSettings(ctx.settings);
	}

	/**
	 * Called by the plugin manager with new audio levels.
	 * Calculates per-key fill levels and updates the display.
	 */
	async updateLevels(levels: AudioLevels): Promise<void> {
		for (const [id, ctx] of this.contexts) {
			const theme = THEMES[ctx.settings.theme] || THEMES.classic;
			const segIdx = ctx.column;
			const isLeftChannel = ctx.row === 0;
			const channelLevel = isLeftChannel ? levels.left : levels.right;
			const channelPeak = isLeftChannel ? levels.peakLeft : levels.peakRight;

			// Calculate fill level for this specific key
			// Each key covers 1/4 of the total range
			const segStart = segIdx / SEGMENTS_TWO_ROW;
			const segEnd = (segIdx + 1) / SEGMENTS_TWO_ROW;

			let fillLevel: number;
			if (channelLevel >= segEnd) {
				fillLevel = 1.0;
			} else if (channelLevel > segStart) {
				fillLevel = (channelLevel - segStart) / (segEnd - segStart);
			} else {
				fillLevel = 0;
			}

			// Peak position relative to this key
			let peakLevel = -1;
			if (ctx.settings.showPeaks && channelPeak >= segStart && channelPeak < segEnd) {
				peakLevel = (channelPeak - segStart) / (segEnd - segStart);
			}

			const img = renderKeyBar(fillLevel, segIdx, SEGMENTS_TWO_ROW, theme, peakLevel, true);

			// Only update if the image actually changed (reduces USB traffic)
			const lastImg = this.lastImages.get(id);
			if (img !== lastImg) {
				this.lastImages.set(id, img);
				try {
					// Use the actions collection to find this specific action instance
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


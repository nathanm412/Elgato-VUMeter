/**
 * Two-Row VU Meter Action
 *
 * Uses keys arranged in up to 2 rows on any Stream Deck model.
 * Top row = Left channel, Bottom row = Right channel.
 *
 * Dynamically detects how many keys the user has placed and adapts
 * the segment count accordingly. Supports both vertical (bottom-to-top)
 * and horizontal (left-to-right) bar orientations.
 *
 * When all keys are in a single row with horizontal orientation,
 * automatically switches to mono mode spanning the full width.
 */

import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import {renderKeyBar, renderHorizontalKeyBar, renderSolidKeyBar} from "../rendering/key-renderer";
import type {DisplayStyle} from "../rendering/key-renderer";
import {AudioLevels} from "../audio/audio-capture";
import {THEMES, THEME_ORDER} from "../utils/color";
import type {JsonValue} from "@elgato/utils";

interface TwoRowSettings {
	theme: string;
	showPeaks: boolean;
	peakHold: boolean;
	orientation: "vertical" | "horizontal";
	displayStyle: DisplayStyle;
	sensitivityTuning: string;
	[key: string]: JsonValue;
}

const DEFAULT_SETTINGS: TwoRowSettings = {
	theme: "classic",
	showPeaks: true,
	peakHold: true,
	orientation: "horizontal",
	displayStyle: "gradient",
	sensitivityTuning: "default",
};

interface ActionContext {
	context: string;
	row: number;    // 0 = top (left), 1 = bottom (right)
	column: number;
	settings: TwoRowSettings;
}

@action({ UUID: "com.nathanm412.vumeter.two-row" })
export class VUMeterTwoRow extends SingletonAction<TwoRowSettings> {
	private contexts: Map<string, ActionContext> = new Map();
	private lastImages: Map<string, string> = new Map();
	private onSettingsChanged: ((settings: TwoRowSettings) => void) | null = null;

	setOnSettingsChanged(cb: (settings: TwoRowSettings) => void): void {
		this.onSettingsChanged = cb;
	}
	private totalSegments = 1;
	private minColumn = 0;
	private minRow = 0;
	private isSingleRowMode = false;

	private computeSegmentInfo(): void {
		if (this.contexts.size === 0) {
			this.totalSegments = 1;
			this.minColumn = 0;
			this.minRow = 0;
			this.isSingleRowMode = false;
			return;
		}

		const columns: number[] = [];
		const rows = new Set<number>();
		for (const ctx of this.contexts.values()) {
			columns.push(ctx.column);
			rows.add(ctx.row);
		}

		const oldSegments = this.totalSegments;
		this.minColumn = Math.min(...columns);
		this.minRow = Math.min(...rows);
		this.totalSegments = Math.max(...columns) - this.minColumn + 1;
		this.isSingleRowMode = rows.size === 1;

		// Force full re-render when segment count changes
		if (oldSegments !== this.totalSegments) {
			this.lastImages.clear();
		}
	}

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
		this.computeSegmentInfo();

		// Set initial dark state
		const theme = THEMES[settings.theme] || THEMES.classic;
		const segIdx = coords.column - this.minColumn;
		const renderFn = settings.orientation === "horizontal" ? renderHorizontalKeyBar : renderKeyBar;
		const img = renderFn(0, segIdx, this.totalSegments, theme, -1, false);
		await ev.action.setImage(img);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<TwoRowSettings>): Promise<void> {
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

	override async onWillDisappear(ev: WillDisappearEvent<TwoRowSettings>): Promise<void> {
		this.contexts.delete(ev.action.id);
		this.lastImages.delete(ev.action.id);
		this.computeSegmentInfo();
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
			const segIdx = ctx.column - this.minColumn;
			const isHorizontal = ctx.settings.orientation === "horizontal";
			const isSolid = ctx.settings.displayStyle === "solid";

			// In single-row horizontal mode, use mono (louder channel)
			let channelLevel: number;
			let channelPeak: number;
			if (this.isSingleRowMode && isHorizontal) {
				channelLevel = Math.max(levels.left, levels.right);
				channelPeak = Math.max(levels.peakLeft, levels.peakRight);
			} else {
				// Use relative row position: top row (minRow) = left channel
				const isLeftChannel = ctx.row === this.minRow;
				channelLevel = isLeftChannel ? levels.left : levels.right;
				channelPeak = isLeftChannel ? levels.peakLeft : levels.peakRight;
			}

			// Calculate fill level for this specific key
			const segStart = segIdx / this.totalSegments;
			const segEnd = (segIdx + 1) / this.totalSegments;

			let img: string;

			if (isSolid) {
				// Solid mode: binary on/off per key
				const isLit = channelLevel >= segEnd || (channelLevel > segStart);
				const isPeak = ctx.settings.showPeaks && channelPeak >= segStart && channelPeak < segEnd;
				img = renderSolidKeyBar(isLit, segIdx, this.totalSegments, theme, !isLit && isPeak);
			} else {
				// Gradient mode: smooth fill
				let fillLevel: number;
				if (channelLevel >= segEnd) {
					fillLevel = 1.0;
				} else if (channelLevel > segStart) {
					fillLevel = (channelLevel - segStart) / (segEnd - segStart);
				} else {
					fillLevel = 0;
				}

				let peakLevel = -1;
				if (ctx.settings.showPeaks && channelPeak >= segStart && channelPeak < segEnd) {
					peakLevel = (channelPeak - segStart) / (segEnd - segStart);
				}

				const renderFn = isHorizontal ? renderHorizontalKeyBar : renderKeyBar;
				img = renderFn(fillLevel, segIdx, this.totalSegments, theme, peakLevel, true);
			}

			// Only update if the image actually changed (reduces USB traffic)
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

/**
 * Touch Display VU Meter Action
 *
 * Renders the VU meter on the Stream Deck Plus touch LCD strip (800x100).
 * Each of the 4 encoder slots shows one quarter of the meter.
 * Together they form a seamless full-width stereo VU meter.
 *
 * Encoder interactions:
 *   - Rotate: Adjust sensitivity
 *   - Push: Toggle auto/manual sensitivity
 *   - Touch: Cycle color theme
 *   - Long Touch: Reset peaks
 */

import streamDeck, {
	action,
	DialAction,
	DialDownEvent,
	DialRotateEvent,
	DidReceiveSettingsEvent,
	SingletonAction,
	TouchTapEvent,
	WillAppearEvent,
	WillDisappearEvent
} from "@elgato/streamdeck";
import {renderTouchSlot, renderCompactTouchSlot} from "../rendering/touch-renderer";
import {AudioLevels} from "../audio/audio-capture";
import {THEMES, THEME_ORDER} from "../utils/color";
import type {JsonValue} from "@elgato/utils";

interface TouchSettings {
	theme: string;
	showPeaks: boolean;
	sensitivity: number;
	sensitivityTuning: string;
	[key: string]: JsonValue;
}

const DEFAULT_SETTINGS: TouchSettings = {
	theme: "classic",
	showPeaks: true,
	sensitivity: 1.0,
	sensitivityTuning: "default",
};

interface EncoderContext {
	context: string;
	slotIndex: number;
	settings: TouchSettings;
}

@action({ UUID: "com.nathanm412.vumeter.touch" })
export class VUMeterTouch extends SingletonAction<TouchSettings> {
	private contexts: Map<string, EncoderContext> = new Map();
	private lastImages: Map<string, string> = new Map();
	private onSensitivityChange: ((delta: number) => void) | null = null;
	private onResetPeaks: (() => void) | null = null;
	private onToggleSensitivityMode: (() => void) | null = null;
	private onSettingsChanged: ((settings: TouchSettings) => void) | null = null;

	setCallbacks(
		onSensitivity: (delta: number) => void,
		onReset: () => void,
		onToggleMode: () => void,
		onSettings: (settings: TouchSettings) => void,
	): void {
		this.onSensitivityChange = onSensitivity;
		this.onResetPeaks = onReset;
		this.onToggleSensitivityMode = onToggleMode;
		this.onSettingsChanged = onSettings;
	}

	override async onWillAppear(ev: WillAppearEvent<TouchSettings>): Promise<void> {
		const settings = {...DEFAULT_SETTINGS, ...ev.payload.settings};
		const coords = (ev.payload as Record<string, unknown>).coordinates as { row: number; column: number } | undefined;

		const ctx: EncoderContext = {
			context: ev.action.id,
			slotIndex: coords?.column ?? 0,
			settings,
		};
		this.contexts.set(ev.action.id, ctx);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<TouchSettings>): Promise<void> {
		const ctx = this.contexts.get(ev.action.id);
		if (!ctx) return;
		const newSettings = { ...DEFAULT_SETTINGS, ...ev.payload.settings };
		ctx.settings = newSettings;

		// Global sync: apply settings to all sibling encoder contexts
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

		this.lastImages.clear();
		this.onSettingsChanged?.(newSettings);
	}

	override async onWillDisappear(ev: WillDisappearEvent<TouchSettings>): Promise<void> {
		this.contexts.delete(ev.action.id);
	}

	override async onDialRotate(ev: DialRotateEvent<TouchSettings>): Promise<void> {
		// Adjust sensitivity via dial rotation
		const delta = ev.payload.ticks * 0.05;
		this.onSensitivityChange?.(delta);
	}

	override async onDialDown(_ev: DialDownEvent<TouchSettings>): Promise<void> {
		// Toggle between auto and manual sensitivity modes
		this.onToggleSensitivityMode?.();
	}

	override async onTouchTap(ev: TouchTapEvent<TouchSettings>): Promise<void> {
		const ctx = this.contexts.get(ev.action.id);
		if (!ctx) return;

		if (ev.payload.hold) {
			// Long touch: reset peaks
			this.onResetPeaks?.();
		} else {
			// Short touch: cycle theme
			const currentIdx = THEME_ORDER.indexOf(ctx.settings.theme);
			const nextIdx = (currentIdx + 1) % THEME_ORDER.length;
			ctx.settings.theme = THEME_ORDER[nextIdx];
			await ev.action.setSettings(ctx.settings);
		}
	}

	async updateLevels(levels: AudioLevels): Promise<void> {
		for (const [id, ctx] of this.contexts) {
			const theme = THEMES[ctx.settings.theme] || THEMES.classic;

			// Render the appropriate slot
			const img = this.contexts.size >= 4
				? renderTouchSlot(ctx.slotIndex, levels, theme, ctx.settings.showPeaks)
				: renderCompactTouchSlot(levels, theme, ctx.settings.showPeaks);

			const lastImg = this.lastImages.get(id);
			if (img !== lastImg) {
				this.lastImages.set(id, img);
				try {
					const action = streamDeck.actions.find((a) => a.id === id) as DialAction | undefined;
					if (action && "setFeedback" in action) {
						await action.setFeedback({canvas: img});
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


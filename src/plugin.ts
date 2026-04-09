/**
 * VU Meter Plugin — Main Entry Point
 *
 * Orchestrates audio capture and distributes level data to all active
 * display actions (keypad and touch display).
 *
 * Architecture:
 *   AudioCapture  ──> emits 'levels' events at ~20fps
 *       │
 *       ├──> VUMeterKeypad.updateLevels()  (key rendering, two-row/one-row modes)
 *       ├──> VUMeterOneRow.updateLevels()  (legacy compat, hidden from action list)
 *       └──> VUMeterTouch.updateLevels()   (touch strip rendering)
 */

import streamDeck from "@elgato/streamdeck";
import { VUMeterKeypad } from "./actions/vumeter-two-row";
import { VUMeterOneRow } from "./actions/vumeter-one-row";
import { VUMeterTouch } from "./actions/vumeter-touch";
import { AudioCapture, AudioLevels } from "./audio/audio-capture";
import { UPDATE_INTERVAL_MS } from "./utils/constants";

// Create action singletons
const keypadAction = new VUMeterKeypad();
const oneRowAction = new VUMeterOneRow();
const touchAction = new VUMeterTouch();

// Create audio capture
const audioCapture = new AudioCapture();

// Handle sensitivity tuning from any action's settings
function applySensitivityTuning(settings: { sensitivityTuning?: string | number }): void {
  if (settings.sensitivityTuning !== undefined) {
    audioCapture.setSensitivityTuning(settings.sensitivityTuning);
  }
}

// Cross-action theme sync
let currentTheme = "classic";

function syncTheme(newTheme: string, source: "two-row" | "one-row" | "touch"): void {
  if (newTheme === currentTheme) return;
  currentTheme = newTheme;

  if (source !== "two-row") keypadAction.setTheme(newTheme);
  if (source !== "one-row") oneRowAction.setTheme(newTheme);
  if (source !== "touch") touchAction.setTheme(newTheme);
}

// Wire up touch encoder callbacks
touchAction.setCallbacks(
  (delta) => audioCapture.adjustSensitivity(delta),
  () => audioCapture.resetPeaks(),
  () => audioCapture.toggleSensitivityMode(),
  (settings) => {
    applySensitivityTuning(settings);
    if (settings.theme) syncTheme(settings.theme, "touch");
  },
);

// Wire up key action settings callbacks
keypadAction.setOnSettingsChanged((settings) => {
  applySensitivityTuning(settings);
  if (settings.theme) syncTheme(settings.theme, "two-row");
});
oneRowAction.setOnSettingsChanged((settings) => {
  applySensitivityTuning(settings);
  if (settings.theme) syncTheme(settings.theme, "one-row");
});

// Rate limiter for display updates
let lastUpdateTime = 0;
let pendingLevels: AudioLevels | null = null;
let updateTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleUpdate(levels: AudioLevels): void {
  pendingLevels = levels;

  if (updateTimer) return;

  const now = Date.now();
  const elapsed = now - lastUpdateTime;
  const delay = Math.max(0, UPDATE_INTERVAL_MS - elapsed);

  updateTimer = setTimeout(async () => {
    updateTimer = null;
    if (!pendingLevels) return;

    lastUpdateTime = Date.now();
    const lvl = pendingLevels;
    pendingLevels = null;

    // Distribute to all active actions concurrently
    const updates: Promise<void>[] = [];

    if (keypadAction.getContextCount() > 0) {
      updates.push(keypadAction.updateLevels(lvl));
    }
    if (oneRowAction.getContextCount() > 0) {
      updates.push(oneRowAction.updateLevels(lvl));
    }
    if (touchAction.getContextCount() > 0) {
      updates.push(touchAction.updateLevels(lvl));
    }

    await Promise.allSettled(updates);
  }, delay);
}

// Listen for audio levels
audioCapture.on("levels", (levels: AudioLevels) => {
  scheduleUpdate(levels);
});

// Start audio capture when plugin loads
audioCapture.start();

// Register actions and connect
streamDeck.actions.registerAction(keypadAction);
streamDeck.actions.registerAction(oneRowAction);
streamDeck.actions.registerAction(touchAction);

streamDeck.connect();

// Graceful shutdown
process.on("SIGTERM", () => {
  audioCapture.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  audioCapture.stop();
  process.exit(0);
});

console.log("VU Meter plugin started");

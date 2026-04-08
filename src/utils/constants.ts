/**
 * Shared constants for the VU Meter plugin.
 */

// Stream Deck Plus key dimensions
export const KEY_SIZE = 144;  // pixels (72x72 at 2x for retina)
export const KEY_SIZE_1X = 72;

// Touch strip dimensions (per encoder slot)
export const TOUCH_SLOT_WIDTH = 200;
export const TOUCH_SLOT_HEIGHT = 100;

// Audio capture defaults
export const SAMPLE_RATE = 48000;
export const FRAME_SIZE = 2048;
export const CHANNELS = 2;

// VU meter behavior
export const HISTORY_LENGTH = 40;
export const MIN_SENSITIVITY = 0.05;
export const FALL_SPEED_PER_SEC = 7.0;     // decay rate in units per second (~0.35 per frame at 20fps)
export const ATTACK_SPEED = 1.0;            // instant attack (multiplier)
export const PEAK_HOLD_TIME_MS = 1500;
export const PEAK_FALL_SPEED_PER_SEC = 3.0; // peak decay rate in units per second

// Legacy aliases for backwards compatibility with tests
export const FALL_SPEED = 0.35;
export const PEAK_FALL_SPEED = 0.15;

// Display modes
export const SEGMENTS_TWO_ROW = 4;   // 4 keys per channel
export const SEGMENTS_ONE_ROW = 4;   // 4 keys, each split L/R
export const SEGMENTS_TOUCH = 32;    // virtual segments on touch strip

// Update rate
export const UPDATE_INTERVAL_MS = 33;  // ~30 fps target for improved responsiveness

// Stream Deck Plus layout
export const SD_PLUS_COLUMNS = 4;
export const SD_PLUS_ROWS = 2;
export const SD_PLUS_KEYS = 8;
export const SD_PLUS_ENCODERS = 4;

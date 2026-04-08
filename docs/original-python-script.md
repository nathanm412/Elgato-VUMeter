# Original Python Script Reference

This document describes the behavior and architecture of the original Python VU meter script (`stereo6 a.py`) from PA9MWO's Elgato-VUMeter repository. It serves as a reference for understanding design decisions in the TypeScript plugin and tracking feature parity.

## Overview

The original script is a standalone Python application that renders a stereo VU meter on the Elgato Stream Deck XL (32 keys, 4x8 grid). It uses the `streamdeck` Python library for device communication and the `soundcard` library for audio capture.

**Hardware target:** Elgato Stream Deck XL (32 keys in a 4x8 grid)

## Audio Capture

- **Library:** `soundcard` (Python) with loopback device capture
- **Method:** Direct loopback recording from the default audio output device
- **Chunk processing:** ~43ms intervals (2048 samples at 48kHz)
- **Level calculation:** Simple mean of absolute values per channel (not RMS, not peak)
- **Frame delay:** 5ms sleep between frames

### Level Calculation

```python
data = mic.record(numframes=2048)
left_level = np.mean(np.abs(data[:, 0]))
right_level = np.mean(np.abs(data[:, 1]))
```

This approach averages absolute sample values, producing a smoother signal than peak detection.

## Adaptive Sensitivity (Auto-Gain)

The script automatically scales the meter display based on recent audio volume history.

- **History buffer:** Rolling 40-sample buffer of peak volumes
- **Sensitivity calculation:** `sensitivity = max(history)` with a floor of `0.05`
- **Display scaling:** `display_level = raw_volume * num_segments / sensitivity`
- **Minimum floor:** Prevents noise amplification during silence

### Behavior

| Scenario | Effect |
|---|---|
| Quiet audio (e.g., podcast at 10%) | Sensitivity drops, meter shows meaningful movement |
| Loud transient (e.g., drum hit) | Sensitivity jumps up immediately |
| After loud transient subsides | Sensitivity gradually decays as old samples exit the rolling window |
| Complete silence | Sensitivity stays at minimum floor (0.05), meter shows no movement |

## Attack/Decay Smoothing

The script uses a simple per-frame smoothing algorithm:

- **Attack:** Instantaneous — when the new level exceeds the current display level, the display jumps directly to the new value
- **Decay:** Linear falloff of `0.35` units per frame
- **No frame-rate compensation:** Decay is purely per-frame, not time-based

```python
if new_level > display_level:
    display_level = new_level      # instant attack
else:
    display_level -= 0.35          # gradual decay per frame
```

Since the Python script runs at ~200fps (5ms sleep + processing time), the effective decay rate is very fast.

## Display Rendering

- **Mode:** Solid-color key images only (binary on/off per key)
- **Image format:** Pre-generated 72x72 PIL images (one per segment color)
- **Rendering approach:** Keys are either fully lit in their position-based color or set to `None` (black)
- **No partial fills:** No gradients, no smooth transitions within a single key

### Key Layout (Stream Deck XL)

```
Row 0 (keys  0-7):  Unused / other functions
Row 1 (keys  8-15): Left channel  (8 segments, left to right)
Row 2 (keys 16-23): Right channel (8 segments, left to right)
Row 3 (keys 24-31): Unused / other functions
```

### Color Mapping (8 segments)

| Segments | Color  | Meaning |
|----------|--------|---------|
| 1-4      | Green  | Safe    |
| 5-6      | Yellow | Caution |
| 7-8      | Red    | Clipping|

```python
solid_images = [
    green, green, green, green,   # segments 1-4
    yellow, yellow,                # segments 5-6
    red, red                       # segments 7-8
]

# Rendering:
deck.set_key_image(l_key, solid_images[i] if i < l_lvl_int else None)
```

## Device Change Detection

The script polls for audio device changes:

- **Poll interval:** Every 2 seconds
- **Detection method:** Checks if the loopback device name has changed
- **Visual notification:** Flashes VU meter keys blue twice when a device change is detected
- **Recovery:** Stops recording on the old device and starts recording on the new device

```python
new_mic = get_loopback_device()
if new_mic.name != current_mic.name:
    flash_blue()  # visual notification
    current_mic = new_mic
    # restart recording with new device
```

## Error Handling

- **Simple try/except:** Catches all exceptions during the audio capture loop
- **Recovery:** Sleeps 1 second, then re-acquires the loopback device
- **No retry limit:** Retries indefinitely

```python
except Exception:
    time.sleep(1.0)
    current_mic = get_loopback_device()
```

## Feature Comparison: Python vs TypeScript

| Feature | Python (Original) | TypeScript (Plugin) |
|---|---|---|
| **Hardware** | Stream Deck XL only | Any Stream Deck model + Plus touch strip |
| **Audio capture** | Direct `soundcard` library | Platform helpers (WASAPI/CoreAudio) via IPC |
| **Level calculation** | Mean of absolute values | Raw level from system audio meter |
| **Display mode** | Solid on/off per key | Gradient fills (default) + Solid mode |
| **Display resolution** | 8 binary segments | Continuous 0-100% per key (effectively 400+ levels with 4 keys) |
| **Adaptive sensitivity** | 40-sample rolling history | 40-sample rolling history (matching) |
| **Sensitivity control** | Auto only | Auto (default) + Manual via encoder |
| **Attack** | Instantaneous | Instantaneous (matching) |
| **Decay** | 0.35/frame (frame-rate dependent) | 7.0/sec (time-based, frame-rate independent) |
| **Peak indicators** | None | Configurable peak hold with decay |
| **Color themes** | Single (Green/Yellow/Red) | 4 themes (Classic, Cool Blue, Synthwave, Warm) |
| **Orientation** | Horizontal only | Vertical + Horizontal |
| **Device detection** | 2s polling with blue flash | 3s polling with auto-restart |
| **Error recovery** | 1s sleep + retry | Exponential backoff (1-5s) with max retries |
| **Multi-device** | Stream Deck XL only | Multi-device with dynamic segment detection |
| **Touch display** | N/A | Full-width stereo meter on SD Plus LCD |
| **Frame rate** | ~200fps (5ms sleep) | ~30fps (33ms interval) |
| **Settings UI** | None (hardcoded) | Property Inspector with theme, orientation, style |

## Design Rationale

### Why the TypeScript plugin differs

1. **Gradient fills vs solid:** The plugin uses fewer physical keys but compensates with higher per-key resolution through SVG gradient fills, achieving 400+ effective levels vs 8 binary segments.

2. **IPC-based audio:** The Stream Deck SDK v2 runs as a Node.js plugin, so direct audio library access isn't available. Platform helper scripts bridge this gap via stdout pipes.

3. **Time-based decay:** The original's per-frame decay works because it runs at ~200fps. At the plugin's ~30fps, per-frame decay would be too slow. Time-based decay ensures consistent behavior regardless of frame rate.

4. **Multi-device support:** The plugin dynamically detects key positions rather than hardcoding to XL's 4x8 grid, supporting any Stream Deck model.

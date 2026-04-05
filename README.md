# VU Meter for Stream Deck

A real-time stereo audio VU meter plugin for Elgato Stream Deck devices. Features gradient-filled key bars, touch display rendering, dynamic key detection, and multiple display modes with both vertical and horizontal orientations.

> Inspired by [this Reddit post](https://www.reddit.com/r/elgato/comments/1s56dm8/whats_is_the_name_of_this_plugin_en_where_to/) and the original Python VU meter script.

## Features

- **Dynamic key detection** — automatically adapts to however many keys you place, from 1 to 32
- **Vertical & horizontal orientations** — bars fill bottom-to-top or left-to-right
- **Gradient fill bars** — each key shows partial fill levels for high visual fidelity
- **Touch strip support** — full-width stereo metering on the Stream Deck Plus LCD
- **4 color themes** — Classic, Cool Blue, Synthwave, Warm
- **Peak hold indicators** with configurable decay
- **Cross-platform** — Windows + macOS
- **Works on any Stream Deck model** with LCD keys

## Installation

1. Download the latest `.streamDeckPlugin` file from [Releases](../../releases)
2. Double-click the file to install it in the Stream Deck app
3. Drag a VU Meter action onto your Stream Deck profile
4. Place as many keys as you want — the meter adapts automatically

## Display Modes

### Two-Row Mode

Uses two rows of keys — top row for Left channel, bottom row for Right:

```
[L1] [L2] [L3] [L4] ... [Ln]    <- Left channel (green -> red)
[R1] [R2] [R3] [R4] ... [Rn]    <- Right channel (green -> red)
```

Place any number of keys per row — the meter dynamically scales its segment count to match. Each key renders a gradient bar with continuous fill, giving you far more resolution than a simple on/off display.

**Single-row horizontal mode:** If all Two-Row keys are placed in one row with horizontal orientation, the meter automatically switches to mono mode, combining both channels into a single left-to-right display spanning all keys.

### One-Row Mode

Uses a single row — each key is split showing both channels side-by-side (vertical) or stacked (horizontal):

```
Vertical:    [L|R] [L|R] [L|R] [L|R] ...
Horizontal:  [L/R] [L/R] [L/R] [L/R] ...  (top=L, bottom=R)
```

Frees up the other row for other Stream Deck actions.

### Touch Display Mode (Stream Deck Plus)

Renders a full-width stereo VU meter across the 800x100 pixel touch strip, with 32 smooth segments per channel, dB scale markings, and peak indicators.

Encoder interactions:
- **Rotate** — Adjust sensitivity
- **Push** — Toggle peak hold
- **Tap** — Cycle color themes
- **Long press** — Reset peak markers

## Configuration

Open the property inspector for any VU Meter action to configure:

| Setting | Options | Description |
|---------|---------|-------------|
| **Theme** | Classic, Cool Blue, Synthwave, Warm | Color scheme for the meter bars |
| **Orientation** | Vertical, Horizontal | Bar fill direction (key actions only) |
| **Show Peaks** | On/Off | Peak hold indicator lines |

You can also press any VU meter key to quickly cycle through themes.

## Color Themes

| Theme | Description |
|-------|-------------|
| Classic | Traditional green -> yellow -> red |
| Cool Blue | Blue gradient with orange/red peaks |
| Synthwave | Purple -> pink -> hot pink |
| Warm | Orange/amber with red peaks |

## Supported Hardware

The plugin works on any Stream Deck model with LCD keys:

- **Stream Deck Plus** — Full support including touch strip LCD and encoders
- **Stream Deck XL** — Up to 32 keys across 4x8 grid
- **Stream Deck MK.2** — Up to 15 keys across 3x5 grid
- **Stream Deck Mini** — Up to 6 keys across 2x3 grid

## Audio Setup

**Windows:** Works automatically via WASAPI loopback — captures whatever audio is playing through your default output device.

**macOS:** Requires a virtual audio loopback device like [BlackHole](https://existential.audio/blackhole/) to capture system audio.

---

<details>
<summary><strong>Development</strong></summary>

### Prerequisites

- Node.js 20+
- npm 9+
- Stream Deck app 6.6+ (for testing)
- Elgato Stream Deck hardware (for full testing)

### Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript and copy assets |
| `npm run watch` | Watch mode for development |
| `npm run dev` | Build + launch in Stream Deck dev mode |
| `npm test` | Run tests |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript type checking |
| `npm run pack` | Build + package as .streamDeckPlugin |
| `npm run clean` | Remove build artifacts |

### Building from Source

```bash
git clone https://github.com/nathanm412/Elgato-VUMeter.git
cd Elgato-VUMeter
npm install
npm run build
npm run pack
```

Then double-click the generated `com.nathanm412.vumeter.streamDeckPlugin` file.

### Project Structure

```
src/
  plugin.ts                   # Main entry point & orchestrator
  actions/
    vumeter-two-row.ts        # Two-row display mode (dynamic key count)
    vumeter-one-row.ts        # One-row split L/R mode (dynamic key count)
    vumeter-touch.ts          # Touch strip display mode
  audio/
    audio-capture.ts          # Cross-platform audio capture
  rendering/
    key-renderer.ts           # SVG bar renderer (vertical + horizontal)
    touch-renderer.ts         # SVG renderer for touch strip
  helpers/
    audio-capture-win.ps1     # Windows WASAPI loopback helper
    audio-capture-mac.sh      # macOS audio capture helper
  utils/
    color.ts                  # Color themes & utilities
    constants.ts              # Shared constants
```

### Architecture

```
AudioCapture  --> emits 'levels' events at ~20fps
    |
    |-- VUMeterTwoRow.updateLevels()  -> renders gradient key SVGs
    |-- VUMeterOneRow.updateLevels()  -> renders split L/R key SVGs
    '-- VUMeterTouch.updateLevels()   -> renders touch strip SVGs
```

The plugin uses a shared `AudioCapture` instance that captures system audio via platform-specific helpers (WASAPI on Windows, CoreAudio on macOS) and distributes normalized levels to all active display actions. Each action dynamically computes its segment count from the coordinates of active keys.

### CI/CD Pipeline

The GitHub Actions pipeline runs on every push and PR:

1. **Lint & Type Check** — ESLint + TypeScript strict mode
2. **Tests** — Jest unit tests for rendering and color utilities
3. **Build** — Full TypeScript compilation + asset verification
4. **Package** — Creates `.streamDeckPlugin` artifact (main branch only)
5. **Release** — Auto-creates GitHub releases on version tags

To create a release:
```bash
git tag v1.0.0
git push origin v1.0.0
```

</details>

<details>
<summary><strong>Legacy</strong></summary>

The original Python script (`stereo6 a.py`) ran on Stream Deck XL (32 keys) and used 16 keys for the stereo meter with simple solid-color segments. It has been preserved in the repository for reference. The current TypeScript plugin is a complete rewrite with gradient fill rendering, dynamic key detection, and proper SDK v2 integration.

</details>

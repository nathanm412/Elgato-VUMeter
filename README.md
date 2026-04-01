# Elgato VU Meter - Stream Deck Plus Plugin

A real-time stereo VU meter plugin for the **Elgato Stream Deck Plus**, featuring gradient-filled key bars, touch display rendering, and multiple display modes.

> Inspired by [this Reddit post](https://www.reddit.com/r/elgato/comments/1s56dm8/whats_is_the_name_of_this_plugin_en_where_to/) and the original Python VU meter script by nathanm412.

## What's New (v1.0)

This is a complete rewrite of the original Python script, redesigned as a proper Stream Deck SDK v6 plugin targeting the **Stream Deck Plus** hardware:

- **Three display modes** optimized for the Stream Deck Plus layout
- **Gradient fill bars** instead of binary on/off keys — each key shows partial fill levels for much higher visual fidelity
- **Touch strip support** with full-width stereo metering
- **4 color themes** (Classic, Cool Blue, Synthwave, Warm)
- **Peak hold indicators** with configurable decay
- **Cross-platform** (Windows + macOS)
- **Proper plugin packaging** (.streamDeckPlugin) with CI/CD

## Display Modes

### Two-Row Mode (8 keys)

Uses all 8 LCD keys — top row for Left channel, bottom row for Right:

```
[L1] [L2] [L3] [L4]    <- Left channel (green → red)
[R1] [R2] [R3] [R4]    <- Right channel (green → red)
```

Each key renders a vertical bar with gradient fill. 4 keys × continuous fill = ~400 effective levels of resolution vs. the original 8-segment binary display.

### One-Row Mode (4 keys)

Uses a single row — each key is split vertically showing both channels:

```
[L|R] [L|R] [L|R] [L|R]
```

Frees up the other row for other Stream Deck actions.

### Touch Display Mode (LCD strip)

Renders a full-width stereo VU meter across the 800×100 pixel touch strip, with 32 smooth segments per channel, dB scale markings, and peak indicators.

Encoder interactions:
- **Rotate** → Adjust sensitivity
- **Push** → Toggle peak hold
- **Tap** → Cycle color themes
- **Long press** → Reset peak markers

## Installation

### From Release (Recommended)

1. Download the latest `.streamDeckPlugin` file from [Releases](../../releases)
2. Double-click the file to install it in the Stream Deck app
3. Drag a VU Meter action onto your Stream Deck Plus profile

### From Source

```bash
# Clone the repo
git clone https://github.com/nathanm412/Elgato-VUMeter.git
cd Elgato-VUMeter

# Install dependencies
npm install

# Build the plugin
npm run build

# Package for installation
npm run pack
```

Then double-click the generated `com.nathanm412.vumeter.streamDeckPlugin` file.

## Development

### Prerequisites

- Node.js 20+
- npm 9+
- Stream Deck app 6.6+ (for testing)
- Elgato Stream Deck Plus hardware (for full testing)

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

### Project Structure

```
├── src/
│   ├── plugin.ts                   # Main entry point & orchestrator
│   ├── actions/
│   │   ├── vumeter-two-row.ts      # Two-row (8 key) display mode
│   │   ├── vumeter-one-row.ts      # One-row (4 key) split L/R mode
│   │   └── vumeter-touch.ts        # Touch strip display mode
│   ├── audio/
│   │   └── audio-capture.ts        # Cross-platform audio capture
│   ├── rendering/
│   │   ├── key-renderer.ts         # SVG gradient bar renderer for keys
│   │   └── touch-renderer.ts       # SVG renderer for touch strip
│   ├── helpers/
│   │   ├── audio-capture-win.ps1   # Windows WASAPI loopback helper
│   │   └── audio-capture-mac.sh    # macOS audio capture helper
│   └── utils/
│       ├── color.ts                # Color themes & utilities
│       └── constants.ts            # Shared constants
├── com.nathanm412.vumeter.sdPlugin/
│   ├── manifest.json               # Stream Deck plugin manifest
│   ├── layouts/                    # Touch strip layout definitions
│   ├── imgs/                       # Plugin and action icons
│   └── ui/
│       └── property-inspector.html # Settings UI
├── scripts/
│   ├── copy-assets.js              # Post-build asset copier
│   └── pack.js                     # Plugin packager
├── .github/workflows/
│   ├── ci.yml                      # Build, test, lint, package pipeline
│   └── validate-manifest.yml       # Manifest validation
└── legacy/
    └── stereo6 a.py                # Original Python VU meter script
```

### Architecture

```
AudioCapture  ──> emits 'levels' events at ~20fps
    │
    ├──> VUMeterTwoRow.updateLevels()  → renders gradient key SVGs
    ├──> VUMeterOneRow.updateLevels()  → renders split L/R key SVGs
    └──> VUMeterTouch.updateLevels()   → renders touch strip SVGs
```

The plugin uses a shared `AudioCapture` instance that captures system audio via platform-specific helpers (WASAPI on Windows, CoreAudio on macOS) and distributes normalized levels to all active display actions.

### Audio Setup

**Windows:** Works automatically via WASAPI loopback — captures whatever audio is playing through your default output device.

**macOS:** Requires a virtual audio loopback device like [BlackHole](https://existential.audio/blackhole/) to capture system audio.

## CI/CD Pipeline

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

## Color Themes

| Theme | Description |
|-------|-------------|
| Classic | Traditional green → yellow → red |
| Cool Blue | Blue gradient with orange/red peaks |
| Synthwave | Purple → pink → hot pink |
| Warm | Orange/amber with red peaks |

Press any VU meter key to cycle through themes, or use the property inspector to select one.

## Legacy

The original Python script (`stereo6 a.py`) that ran on Stream Deck XL is preserved in the repository for reference. It required a Stream Deck XL (32 keys) and used 16 keys for the stereo meter with simple solid-color segments.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript Stream Deck plugin that renders a real-time stereo audio VU meter on Elgato Stream Deck keys and touch displays. It uses the Elgato Stream Deck SDK v2 (`@elgato/streamdeck`) and targets Node.js 20.

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile via Rollup + copy assets to sdPlugin dir |
| `npm test` | Run Jest tests (uses `--passWithNoTests`) |
| `npm run lint` | ESLint on `src/` |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run watch` | `tsc --watch` for development |
| `npm run dev` | Build + launch in Stream Deck dev mode |
| `npm run pack` | Build + package as `.streamDeckPlugin` |

Run a single test file: `npx jest src/rendering/key-renderer.test.ts`

## Architecture

Event-driven pipeline with a single shared `AudioCapture` instance:

```
AudioCapture  ──> emits 'levels' events at ~20fps
    │
    ├──> VUMeterTwoRow.updateLevels()  (multi-key gradient bars)
    ├──> VUMeterOneRow.updateLevels()  (split L/R per key)
    └──> VUMeterTouch.updateLevels()   (800x100 touch strip)
```

- **`src/plugin.ts`** — Entry point & orchestrator. Creates a single `AudioCapture`, rate-limits updates via `scheduleUpdate()`, and distributes levels to all active action instances concurrently.
- **`src/actions/`** — Three action classes, one per display mode. Each dynamically computes segment count from the coordinates of active keys. Actions register with the Stream Deck SDK and handle key press / encoder events.
- **`src/audio/audio-capture.ts`** — Cross-platform audio capture. Uses platform-specific helper scripts: WASAPI loopback (PowerShell) on Windows, CoreAudio (shell script) on macOS. Emits normalized `AudioLevels` events.
- **`src/rendering/`** — SVG generators. `key-renderer.ts` renders gradient fill bars (vertical + horizontal orientation). `touch-renderer.ts` renders the full-width touch strip with dB scale markings.
- **`src/utils/color.ts`** — Four color themes (Classic, Cool Blue, Synthwave, Warm) with gradient utilities.
- **`src/helpers/`** — Source copies of the platform audio capture scripts (build copies them into `com.nathanm412.vumeter.sdPlugin/helpers/`).

## Plugin Structure

`com.nathanm412.vumeter.sdPlugin/` is the deployable plugin directory. `manifest.json` defines actions, properties, and capabilities. `ui/property-inspector.html` is the settings panel. Build output goes to `bin/` within this directory.

## Build System

Rollup bundles `src/plugin.ts` into a single CJS file at `com.nathanm412.vumeter.sdPlugin/bin/plugin.js`. The `scripts/copy-assets.js` post-build step copies helper scripts into the plugin directory.

## Testing

Jest with `ts-jest` preset. Tests live alongside source files (`*.test.ts`). Current test coverage: rendering logic (`key-renderer.test.ts`) and color utilities (`color.test.ts`). Coverage excludes `plugin.ts` and `.d.ts` files.

## Linting

ESLint flat config (`eslint.config.mjs`) with `@typescript-eslint`. Unused vars prefixed with `_` are allowed. Only `.ts` files in `src/` are linted; `.js` files are ignored.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on pushes to `main`, `develop`, `feature/**`, `claude/**` and PRs to `main`. Pipeline: lint + typecheck -> tests -> build -> package (main/tags only) -> release (version tags only). Releases are created by pushing a `v*` tag.

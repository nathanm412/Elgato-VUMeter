# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript Stream Deck plugin that renders a real-time stereo audio VU meter on Elgato Stream Deck keys and touch displays. It uses the Elgato Stream Deck SDK v2 (`@elgato/streamdeck`) and targets Node.js 24 (requires the Stream Deck app 7.1+).

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile via Rollup + copy assets to sdPlugin dir |
| `npm test` | Run Jest tests (uses `--passWithNoTests`) |
| `npm run lint` | ESLint on `src/` |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run typecheck` | Type-check with the native TypeScript 7 compiler (`@typescript/native`) |
| `npm run watch` | Watch/type-check with the native TypeScript 7 compiler (`@typescript/native`) |
| `npm run dev` | Build + launch in Stream Deck dev mode |
| `npm run pack` | Build + package as `.streamDeckPlugin` for distribution (installable by double-clicking) |

Run a single test file: `npx jest src/rendering/key-renderer.test.ts`

## Architecture

Event-driven pipeline with a single shared `AudioCapture` instance:

```
AudioCapture  ──> emits 'levels' events at ~20fps
    │
    ├──> VUMeterKeypad.updateLevels()  (two-row/one-row key modes)
    ├──> VUMeterOneRow.updateLevels()  (legacy compat, hidden)
    └──> VUMeterTouch.updateLevels()   (800x100 touch strip)
```

- **`src/plugin.ts`** — Entry point & orchestrator. Creates a single `AudioCapture`, rate-limits updates via `scheduleUpdate()`, distributes levels to all active actions, and mediates cross-action theme sync.
- **`src/actions/`** — `VUMeterKeypad` (consolidated keypad action with two-row/one-row mode dropdown), `VUMeterOneRow` (legacy compat, hidden from action list), and `VUMeterTouch` (encoder touch strip). Each dynamically computes segment count from active key coordinates.
- **`src/audio/audio-capture.ts`** — Cross-platform audio capture. Uses platform-specific helper scripts: WASAPI loopback (PowerShell) on Windows, CoreAudio (shell script) on macOS. Emits normalized `AudioLevels` events.
- **`src/rendering/`** — SVG generators. `key-renderer.ts` renders gradient fill bars (vertical + horizontal orientation). `touch-renderer.ts` renders the full-width touch strip with dB scale markings.
- **`src/utils/color.ts`** — Four color themes (Classic, Cool Blue, Synthwave, Warm) with gradient utilities.
- **`src/helpers/`** — Source copies of the platform audio capture scripts (build copies them into `com.nathanm412.vumeter.sdPlugin/helpers/`).

## Plugin Structure

`com.nathanm412.vumeter.sdPlugin/` is the deployable plugin directory. `manifest.json` defines actions, properties, and capabilities. `ui/property-inspector.html` is the settings panel. Build output goes to `bin/` within this directory.

## Build System

Rollup bundles `src/plugin.ts` into a single CJS file at `com.nathanm412.vumeter.sdPlugin/bin/plugin.js`. The `scripts/copy-assets.js` post-build step copies helper scripts into the plugin directory.

## Packaging

`npm run pack` builds, then runs the official Elgato CLI's `streamdeck pack` (`@elgato/cli`) — there is no hand-rolled zip script. Notes:

- **It validates the manifest**; validation *errors* abort packing (warnings don't). The top-level plugin `Icon` **must be a `.png`** (with `@2x`); action/`CategoryIcon` icons may be SVG. PNG icons are committed alongside the SVGs in `imgs/`.
- Excludes are driven by `com.nathanm412.vumeter.sdPlugin/.sdignore` (maps, `.d.ts`, test files, etc.) — edit that, not the pack command, to change what ships.
- `streamdeck pack` **re-serializes `manifest.json` without a trailing newline** as a side effect. To keep `build`/`pack` from dirtying the tree, `sync-manifest.js` also writes the manifest without a trailing newline — don't re-add one.

## manifest.json conventions

`com.nathanm412.vumeter.sdPlugin/manifest.json` is **partly generated**: `scripts/sync-manifest.js` (run as the first build step) syncs only `Version` (as `X.Y.Z.0`) and `Description` from `package.json`; everything else is hand-edited. The CI build job enforces manifest-in-sync, and a separate `validate-manifest.yml` workflow checks JSON validity, required fields, unique action UUIDs, and referenced files.

## Node runtime / `@types/node` alignment

The plugin runs under the Node version declared in `manifest.json` `Nodejs.Version` — **not** the latest available. Keep `@types/node`, the `@tsconfig/node*` base, and CI's `node-version` matched to it. Stream Deck only ships **Node 20 or 24** runtimes (per `@elgato/schemas`); there is no Node 26 runtime. Node `24` requires `Software.MinimumVersion` ≥ **7.1** (lower minimums force Node 20). A Renovate rule blocks `@types/node` major bumps so it tracks the runtime — bump `@types/node` and `manifest.Nodejs.Version` together. `tsconfig.json` pins `"types": ["node", "jest"]` (TS 6 no longer auto-resolves the Jest ambient globals for the typechecked `*.test.ts` files otherwise). A full dependency inventory lives in `docs/dependency-review.md`.

### TypeScript 7 side-by-side compiler setup

TypeScript 7 uses the native compiler for CLI type-checking, while several tools in this repository still consume TypeScript's JavaScript compiler API. Keep these two dependencies intentionally side-by-side:

- `@typescript/native` aliases `typescript@7.x` and is the compiler used by `npm run typecheck` and `npm run watch`.
- `typescript` aliases `@typescript/typescript6@6.x` so `typescript-eslint`, `ts-jest`, and `@rollup/plugin-typescript` continue to receive the supported TypeScript 6 programmatic API.
- The typecheck/watch scripts invoke `node_modules/@typescript/native/bin/tsc` explicitly so npm bin-link ordering cannot accidentally select the compatibility compiler.

Do not replace the `typescript` compatibility alias with a direct TypeScript 7 dependency until the programmatic-API consumers support the native compiler.

## Testing

Jest with `ts-jest` preset. Tests live alongside source files (`*.test.ts`). Current test coverage: rendering logic (`key-renderer.test.ts`) and color utilities (`color.test.ts`). Coverage excludes `plugin.ts` and `.d.ts` files.

## Linting

ESLint flat config (`eslint.config.mjs`) with `@typescript-eslint`. Unused vars prefixed with `_` are allowed. Only `.ts` files in `src/` are linted; `.js` files are ignored.

## Pull Requests

Always create pull requests against `nathanm412/Elgato-VUMeter`, not any upstream repository it may have been forked from. Use the `mcp__github__create_pull_request` tool with `owner: "nathanm412"` and `repo: "Elgato-VUMeter"` to ensure the PR targets the correct repository.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on pushes to `main`, `develop`, `feature/**`, `claude/**` and PRs to `main`. Pipeline: lint + typecheck -> tests -> build -> package (main/tags only) -> release (version tags only).

A second workflow (`.github/workflows/release-on-merge.yml`) automates releases when a PR with a `Pre-Release` or `New-Release` label is merged to `main`. `Pre-Release` creates a pre-release with a date+SHA tag; `New-Release` creates a full release using the version from `package.json`. Releases can also be created manually by pushing a `v*` tag.

## Documentation & Hover Text

When changing functionality, always update the corresponding hover text / tooltips in `manifest.json` (Tooltip, TriggerDescription), source file doc comments, property inspector tips, and README. Mismatched documentation confuses users and is easy to miss.

When changing the plugin description in README.md, also update the `description` field in `package.json`. The build system automatically syncs this to `manifest.json`. Run `npm run build` and commit the updated manifest.

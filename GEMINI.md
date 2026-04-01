# Gemini Code Assistant Context

This document provides context for the Gemini AI assistant to understand the "Elgato VU Meter" project.

## Project Overview

This is a TypeScript-based plugin for the **Elgato Stream Deck Plus**. It creates a real-time stereo audio VU meter on the device's keys and touch display.

The project is a rewrite of an older Python script, now using the modern Elgato Stream Deck SDK (v2).

**Key Technologies:**
- **Language:** TypeScript
- **Runtime:** Node.js v20
- **Framework:** Elgato Stream Deck SDK (`@elgato/streamdeck`)
- **Build Tool:** `tsc` (TypeScript Compiler)
- **Testing:** Jest
- **Linting:** ESLint

**Architecture:**
The plugin follows an event-driven architecture:
1.  A central `AudioCapture` service captures system audio (using platform-specific helper scripts) and emits normalized audio `levels` events at ~20 frames per second.
2.  A main `plugin.ts` file acts as the orchestrator. It initializes the `AudioCapture` service and registers the different display "Actions".
3.  Three distinct `Action` classes correspond to the different display modes:
    - `VUMeterTwoRow`: Uses 8 keys for a full stereo display.
    - `VUMeterOneRow`: Uses 4 keys, with each key split vertically to show Left and Right channels.
    - `VUMeterTouch`: Renders a detailed VU meter on the touch strip.
4.  When the `AudioCapture` service emits `levels` events, the main plugin file distributes them to any active Action instances.
5.  Each Action is responsible for calculating its state based on the audio levels and rendering the appropriate UI by generating SVG images and setting them on the keys or touch display.

## Building and Running

The project uses `npm` for dependency management and scripts.

- **Install dependencies:**
  ```bash
  npm install
  ```

- **Build the plugin:**
  This command compiles the TypeScript code to JavaScript in the `com.nathanm412.vumeter.sdPlugin/bin` directory and copies necessary assets.
  ```bash
  npm run build
  ```

- **Run in watch mode (for development):**
  This will automatically recompile the TypeScript code when files change.
  ```bash
  npm run watch
  ```

- **Run tests:**
  ```bash
  npm test
  ```

- **Lint the code:**
  ```bash
  npm run lint
  ```

- **Package the plugin for distribution:**
  This command builds the project and then packages it into a `.streamDeckPlugin` file, which can be installed by double-clicking.
  ```bash
  npm run pack
  ```

## Development Conventions

- **Code Style:** The project uses ESLint with the `@typescript-eslint` plugin to enforce a consistent code style. Refer to the `.eslintrc.json` file for specific rules.
- **Testing:** Unit tests are written with Jest and are located in files ending with `.test.ts`. Tests focus on the rendering logic (`key-renderer.test.ts`) and utility functions (`color.test.ts`).
- **File Structure:**
  - `src/`: Contains all the TypeScript source code.
    - `src/plugin.ts`: The main entry point and orchestrator.
    - `src/actions/`: Contains the classes for each display mode (Two-Row, One-Row, Touch).
    - `src/audio/`: Handles the cross-platform audio capture logic.
    - `src/rendering/`: Contains the logic for generating SVG images for the keys and touch display.
    - `src/utils/`: Contains shared constants and utility functions.
  - `com.nathanm412.vumeter.sdPlugin/`: The folder that represents the plugin to the Stream Deck software.
    - `manifest.json`: The plugin manifest, defining its actions, properties, and capabilities.
    - `ui/`: Contains the HTML/CSS/JS for the Property Inspector (the settings panel in the Stream Deck app).
  - `scripts/`: Contains Node.js scripts for build-related tasks like packaging the plugin.
- **Commits:** There are no explicit commit message conventions in the repository history, but messages are generally descriptive and concise.
- **CI/CD:** GitHub Actions are used for continuous integration (`.github/workflows/ci.yml`). The pipeline runs linting, type checking, tests, and packaging on every push.

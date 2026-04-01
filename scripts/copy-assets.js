/**
 * Post-build script: copies non-TypeScript assets into the .sdPlugin directory.
 * Ensures the built plugin has everything it needs to run.
 */
const fs = require("fs");
const path = require("path");

const PLUGIN_DIR = path.join(__dirname, "..", "com.nathanm412.vumeter.sdPlugin");
const BIN_DIR = path.join(PLUGIN_DIR, "bin");

// Ensure bin directory exists
if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

// Copy package.json for Node.js module resolution (stripped down)
const pkg = require("../package.json");
const runtimePkg = {
  name: pkg.name,
  version: pkg.version,
  main: "plugin.js",
  dependencies: pkg.dependencies,
};

fs.writeFileSync(
  path.join(BIN_DIR, "package.json"),
  JSON.stringify(runtimePkg, null, 2),
);

// Copy audio helper scripts
const HELPERS_SRC = path.join(__dirname, "..", "src", "helpers");
const HELPERS_DEST = path.join(PLUGIN_DIR, "helpers");

if (!fs.existsSync(HELPERS_DEST)) {
  fs.mkdirSync(HELPERS_DEST, { recursive: true });
}

const helperFiles = ["audio-capture-win.ps1", "audio-capture-mac.sh"];
for (const file of helperFiles) {
  const src = path.join(HELPERS_SRC, file);
  const dest = path.join(HELPERS_DEST, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    if (file.endsWith(".sh")) {
      fs.chmodSync(dest, 0o755);
    }
  } else {
    console.warn(`WARNING: Helper script not found: ${src}`);
  }
}

console.log("Assets copied to plugin directory");
console.log("  - bin/package.json (runtime dependencies)");
console.log("  - helpers/audio-capture-win.ps1");
console.log("  - helpers/audio-capture-mac.sh");

// Verify critical files exist
const required = [
  path.join(PLUGIN_DIR, "manifest.json"),
  path.join(PLUGIN_DIR, "imgs", "plugin-icon.svg"),
  path.join(PLUGIN_DIR, "ui", "property-inspector.html"),
  path.join(PLUGIN_DIR, "helpers", "audio-capture-win.ps1"),
  path.join(PLUGIN_DIR, "helpers", "audio-capture-mac.sh"),
];

let ok = true;
for (const f of required) {
  if (!fs.existsSync(f)) {
    console.error(`WARNING: Missing required file: ${f}`);
    ok = false;
  }
}

if (ok) {
  console.log("All required plugin files verified");
}

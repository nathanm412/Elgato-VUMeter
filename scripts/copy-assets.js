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

console.log("Assets copied to plugin directory");
console.log("  - bin/package.json (runtime dependencies)");

// Verify critical files exist
const required = [
  path.join(PLUGIN_DIR, "manifest.json"),
  path.join(PLUGIN_DIR, "imgs", "plugin-icon.svg"),
  path.join(PLUGIN_DIR, "ui", "property-inspector.html"),
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

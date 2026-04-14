/**
 * Syncs version and description from package.json into manifest.json.
 *
 * - Converts semver (X.Y.Z or X.Y.Z-N) to 4-part version (X.Y.Z.0)
 * - Copies description verbatim
 * - Only writes if changes are needed
 */
const fs = require("fs");
const path = require("path");

const MANIFEST_PATH = path.join(
  __dirname,
  "..",
  "com.nathanm412.vumeter.sdPlugin",
  "manifest.json",
);

const pkg = require("../package.json");

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error(`Error: manifest.json not found at ${MANIFEST_PATH}`);
  process.exit(1);
}

const manifestRaw = fs.readFileSync(MANIFEST_PATH, "utf-8");
const manifest = JSON.parse(manifestRaw);

// Convert semver to 4-part version: "1.2.0" -> "1.2.0.0", "1.2.0-3" -> "1.2.0.0"
const coreParts = pkg.version.split("-")[0].split(".");
const fourPartVersion = [
  coreParts[0] || "0",
  coreParts[1] || "0",
  coreParts[2] || "0",
  "0",
].join(".");

const changes = [];

if (manifest.Version !== fourPartVersion) {
  changes.push(`Version: "${manifest.Version}" -> "${fourPartVersion}"`);
  manifest.Version = fourPartVersion;
}

if (manifest.Description !== pkg.description) {
  changes.push(`Description updated to match package.json`);
  manifest.Description = pkg.description;
}

if (changes.length > 0) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log("manifest.json synced with package.json:");
  for (const change of changes) {
    console.log(`  - ${change}`);
  }
} else {
  console.log("manifest.json is already in sync with package.json");
}

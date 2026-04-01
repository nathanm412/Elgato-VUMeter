/**
 * Package the .sdPlugin directory into a .streamDeckPlugin file.
 *
 * A .streamDeckPlugin file is just a ZIP archive containing the plugin
 * directory contents. This script creates one without requiring the
 * Elgato CLI tool.
 */
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const PLUGIN_DIR = path.join(__dirname, "..", "com.nathanm412.vumeter.sdPlugin");
const OUTPUT_FILE = path.join(__dirname, "..", "com.nathanm412.vumeter.streamDeckPlugin");

// Files/dirs to exclude from the package
const EXCLUDE_PATTERNS = [
  ".git/**",
  "*.log",
  "*.map",
  "*.d.ts",
  ".env*",
  "node_modules/.cache/**",
];

async function pack() {
  console.log("Packaging Stream Deck plugin...");
  console.log(`  Source: ${PLUGIN_DIR}`);
  console.log(`  Output: ${OUTPUT_FILE}`);

  if (!fs.existsSync(PLUGIN_DIR)) {
    console.error("Plugin directory not found. Run 'npm run build' first.");
    process.exit(1);
  }

  if (!fs.existsSync(path.join(PLUGIN_DIR, "bin", "plugin.js"))) {
    console.error("Plugin not built. Run 'npm run build' first.");
    process.exit(1);
  }

  const output = fs.createWriteStream(OUTPUT_FILE);
  const archive = archiver("zip", { zlib: { level: 9 } });

  output.on("close", () => {
    const sizeKb = (archive.pointer() / 1024).toFixed(1);
    console.log(`\nPackaged successfully: ${OUTPUT_FILE}`);
    console.log(`  Size: ${sizeKb} KB`);
    console.log(`\nTo install: double-click the .streamDeckPlugin file`);
  });

  archive.on("error", (err) => {
    console.error("Packaging failed:", err);
    process.exit(1);
  });

  archive.pipe(output);

  // Add the plugin directory contents
  archive.directory(PLUGIN_DIR, "com.nathanm412.vumeter.sdPlugin", (entry) => {
    // Filter out excluded patterns
    for (const pattern of EXCLUDE_PATTERNS) {
      const regex = new RegExp(
        "^" + pattern.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$"
      );
      if (regex.test(entry.name)) {
        return false;
      }
    }
    return entry;
  });

  await archive.finalize();
}

pack().catch((err) => {
  console.error(err);
  process.exit(1);
});

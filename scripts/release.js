#!/usr/bin/env node

// Release script for Elgato VU Meter
//
// Usage: node scripts/release.js <major|minor|patch> [--pre-release]
//   or:  npm run release -- <major|minor|patch> [--pre-release]
//
// Examples:
//   npm run release -- patch              # 1.0.0 -> 1.0.1 (full release)
//   npm run release -- minor              # 1.0.0 -> 1.1.0 (full release)
//   npm run release -- major              # 1.0.0 -> 2.0.0 (full release)
//   npm run release -- patch --pre-release # 1.0.0 -> 1.0.1-0 (pre-release)
//   npm run release -- minor --pre-release # 1.0.0 -> 1.1.0-0 (pre-release)

const { execSync } = require("child_process");
const readline = require("readline");

const VALID_BUMPS = ["major", "minor", "patch"];

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf-8", stdio: opts.stdio || "pipe" }).trim();
}

function runVisible(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  let bumpType = null;
  let preRelease = false;

  for (const arg of args) {
    if (VALID_BUMPS.includes(arg)) {
      bumpType = arg;
    } else if (arg === "--pre-release") {
      preRelease = true;
    } else {
      console.error(`Error: Unknown argument '${arg}'`);
      printUsage();
      process.exit(1);
    }
  }

  if (!bumpType) {
    printUsage();
    process.exit(1);
  }

  // Ensure we're on main
  const branch = run("git branch --show-current");
  if (branch !== "main") {
    console.error(`Error: Must be on 'main' branch (currently on '${branch}')`);
    process.exit(1);
  }

  // Ensure working directory is clean
  const status = run("git status --porcelain");
  if (status) {
    console.error("Error: Working directory has uncommitted changes. Commit or stash them first.");
    console.error(status);
    process.exit(1);
  }

  // Pull latest
  console.log("Pulling latest from origin/main...");
  runVisible("git pull origin main");

  // Read current version
  const currentVersion = require("../package.json").version;

  // Determine npm version argument
  const npmVersionArg = preRelease ? `pre${bumpType}` : bumpType;

  // Preview the bump (dry run)
  const newVersion = run(`npm version ${npmVersionArg} --no-git-tag-version`);
  // Revert the preview
  run("git checkout -- package.json package-lock.json");

  const releaseType = preRelease ? "pre-release" : "release";

  console.log("");
  console.log("=== Release Summary ===");
  console.log(`  Current version: ${currentVersion}`);
  console.log(`  New version:     ${newVersion}`);
  console.log(`  Release type:    ${releaseType}`);
  console.log(`  Tag:             ${newVersion}`);
  console.log("=======================");
  console.log("");

  const confirm = await ask("Proceed? (y/N) ");
  if (confirm.toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }

  // Run checks
  console.log("\nRunning lint...");
  runVisible("npm run lint");

  console.log("\nRunning typecheck...");
  runVisible("npm run typecheck");

  console.log("\nRunning tests...");
  runVisible("npm test");

  console.log("\nBuilding...");
  runVisible("npm run build");

  // Bump version, commit, and tag
  console.log(`\nBumping version to ${newVersion}...`);
  runVisible(`npm version ${npmVersionArg} -m "Release %s"`);

  // Push commit and tag
  console.log("\nPushing to origin...");
  runVisible("git push origin main --follow-tags");

  console.log(`\nDone! Release ${newVersion} has been pushed.`);
  console.log("CI will build, package, and create the GitHub release automatically.");
  console.log("Monitor at: https://github.com/nathanm412/Elgato-VUMeter/actions");
}

function printUsage() {
  console.log("");
  console.log("Usage: npm run release -- <major|minor|patch> [--pre-release]");
  console.log("");
  console.log("  major         Bump major version (1.0.0 -> 2.0.0)");
  console.log("  minor         Bump minor version (1.0.0 -> 1.1.0)");
  console.log("  patch         Bump patch version (1.0.0 -> 1.0.1)");
  console.log("  --pre-release Create a pre-release version (1.0.0 -> 1.0.1-0)");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

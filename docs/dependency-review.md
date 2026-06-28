# Dependency Review (issue #112)

Snapshot review of every runtime and dev dependency, done while resolving
issue #112 (post-v1.2.1 dependency + packaging hygiene). Versions reflect the
state at review time; "latest" is the published version on npm at that point.

## Runtime dependencies

| Package | Pinned (range) | Resolved | Latest | Majors behind | Decision |
|---|---|---|---|---|---|
| `@elgato/streamdeck` | `^2.0.4` | 2.1.0 | 2.1.0 | 0 | Keep. Caret range already resolves to latest; build/tests pass. |
| `@elgato-stream-deck/node` | `^7.6.2` | 7.6.3 | 7.6.3 | 0 | Keep. Caret range already resolves to latest. |

## Dev dependencies

| Package | Pinned | Latest | Majors behind | Decision |
|---|---|---|---|---|
| `typescript` | `6.0.3` | 6.0.3 | 0 | **Upgraded 5.9.3 → 6.0.3 in this PR** (closes #33). See notes below. |
| `eslint` | `10.6.0` | 10.6.0 | 0 | **Bumped 10.5.0 → 10.6.0** (safe minor). |
| `archiver` | — | 8.0.0 | n/a | **Removed.** Replaced by `@elgato/cli` packaging (see below); was the root cause of the failed first v1.2.1 release (#109). |
| `@types/node` | `24.13.2` | 26.0.1 | 2 | **Hold at 24.x intentionally** — now correctly aligned with the Node 24 *runtime*. The plugin's runtime is whatever `manifest.json` `Nodejs.Version` declares (now `"24"`), not the latest npm release. Stream Deck only ships Node 20 or Node 24 runtimes (`@elgato/schemas` enum is `["20","24"]`); there is **no Node 26 runtime**, so `@types/node@26` would type-check against APIs that don't exist at runtime. Keep `@types/node`, `@tsconfig/node24`, and CI's `node-version: '24'` matched to the manifest's Node version. |
| `@elgato/cli` | `1.7.4` | 1.7.4 | 0 | Keep (now used for packaging). |
| `@eslint/js` | `10.0.1` | 10.0.1 | 0 | Keep. |
| `@rollup/plugin-commonjs` | `29.0.3` | 29.0.3 | 0 | Keep. |
| `@rollup/plugin-node-resolve` | `16.0.3` | 16.0.3 | 0 | Keep. |
| `@rollup/plugin-typescript` | `12.3.0` | 12.3.0 | 0 | Keep. Builds cleanly against TS 6. |
| `@tsconfig/node24` | `24.0.4` | 24.0.4 | 0 | Keep. |
| `@types/jest` | `30.0.0` | 30.0.0 | 0 | Keep (matches jest 30). |
| `@typescript-eslint/eslint-plugin` | `8.62.0` | 8.62.0 | 0 | Keep. Lints cleanly against TS 6. |
| `@typescript-eslint/parser` | `8.62.0` | 8.62.0 | 0 | Keep. |
| `typescript-eslint` | `8.62.0` | 8.62.0 | 0 | Keep. |
| `jest` | `30.4.2` | 30.4.2 | 0 | Keep. |
| `ts-jest` | `29.4.11` | 29.4.11 | 0 | Keep (works with jest 30 + TS 6). |
| `rollup` | `4.62.2` | 4.62.2 | 0 | Keep. |
| `tslib` | `2.8.1` | 2.8.1 | 0 | Keep. |

## Notable changes made in this pass

### TypeScript 5.9 → 6 (#33)
Bumped `typescript` to 6.0.3. One adjustment was required: under TS 6 the
typecheck no longer auto-resolved the Jest ambient globals (`describe`/`it`/
`expect`) for the `*.test.ts` files included by the root `tsconfig.json`. Fixed
by pinning the ambient type packages explicitly with
`"types": ["node", "jest"]` in `tsconfig.json`. `npm run typecheck`, `lint`,
`test`, and `build` all pass on TS 6 afterward.

### archiver → `@elgato/cli` (packaging)
`scripts/pack.js` (hand-rolled `archiver` zip) was replaced with the official
`streamdeck pack` command from `@elgato/cli` (already a devDependency). This:
- removes `archiver` and its transitive dependencies from the project;
- stays aligned with Elgato's tooling;
- fixes the source-map leak (the old exclude regex was anchored on the top-level
  entry name and never matched nested paths like `bin/plugin.js.map`, so
  `plugin.js.map` shipped in every release). The CLI honors the existing
  `.sdignore`, which already excludes `*.map` / `*.d.ts` / test files — verified
  via `unzip -l` that the package no longer contains them.

The CLI validates the manifest during packaging; this surfaced one error the old
packer ignored — the top-level plugin `Icon` must be a `.png`. A PNG
(`imgs/plugin-icon.png` + `@2x`) was rendered from the existing SVG and added.
The remaining "Category should match plugin name" warning is intentional
(Category is the grouping `Audio`) and is non-blocking.

### actions/checkout v6 → v7 (#102)
Pinned `actions/checkout` to v7 (`9c091bb…`) across `ci.yml`,
`release-on-merge.yml`, and `validate-manifest.yml`.

### Node runtime alignment: Node 20 → Node 24 (manifest)
Investigation of the `@types/node` question revealed the toolchain was a major
ahead of the declared runtime: `manifest.json` declared `Nodejs.Version: "20"`
while the dev toolchain used `@tsconfig/node24` + `@types/node@24` + CI Node 24.
The `@elgato/schemas` manifest schema gates the runtime by the Stream Deck
`Software.MinimumVersion`:
- `Nodejs.Version` may only be `"24"` when `MinimumVersion` ≥ **7.1** (anything
  6.4–7.0 forces `"20"`).
- The schema's `MinimumVersion` branches **7.1, 7.2, 7.3, 7.4 are identical** —
  raising the minimum above 7.1 unlocks no additional manifest capability.
- There is no Node 26 runtime; the only published runtimes are 20 and 24.

Resolution: bumped `Software.MinimumVersion` `6.6 → 7.1` and `Nodejs.Version`
`20 → 24`, so the manifest runtime now matches the node24 toolchain. Trade-off:
drops support for Stream Deck **6.6–7.0**. The Elgato npm packages were already
current (`@elgato/streamdeck` 2.1.0, `@elgato/cli` 1.7.4, `@elgato/schemas`
0.4.15, `@elgato-stream-deck/node` 7.6.3; `SDKVersion` stays 2 — no v3 exists),
so no library upgrade was needed.

## Deferred / left to Renovate
- `@types/node` major (24 → 26): held intentionally (see table) — pinned to the
  Node 24 runtime, not the latest release. **Renovate's `/^@types//` automerge
  rule would otherwise bump this to 26**, breaking the runtime alignment; that
  rule should be scoped to exclude `@types/node` (or pin `@types/node` major) so
  it tracks the manifest's Node version instead.
- The previous Renovate `packageRule` blocking `archiver` major upgrades was
  removed, since `archiver` is no longer a dependency.

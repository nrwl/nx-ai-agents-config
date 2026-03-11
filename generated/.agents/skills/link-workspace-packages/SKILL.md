---
name: link-workspace-packages
description: 'Link workspace packages in monorepos (npm, yarn, pnpm, bun). USE WHEN: (1) you just created or generated new packages and need to wire up their dependencies, (2) user imports from a sibling package and needs to add it as a dependency, (3) you get resolution errors for workspace packages (@org/*) like "cannot find module", "failed to resolve import", "TS2307", or "cannot resolve". DO NOT patch around with tsconfig paths or manual package.json edits - use the package manager''s workspace commands to fix actual linking.'
---

---

name: link-workspace-packages
description: |
Link workspace packages in monorepos (npm, yarn, pnpm, bun). Triggers when you just created or generated new packages and need to wire up their dependencies, when a user imports from a sibling package and needs to add it as a dependency, or when you encounter resolution errors for workspace packages (@org/\*) like "cannot find module", "failed to resolve import", "TS2307", or "cannot resolve". Prefer the package manager's workspace linking commands over manual workarounds like tsconfig paths or hand-editing package.json version strings.

---

# Link Workspace Packages

Add dependencies between packages in a monorepo. All package managers support workspaces but with different syntax.

## Workspace Configuration Prerequisites

Before linking packages, the workspace itself needs to be configured. Without this, the package manager won't know which directories contain workspace packages.

- **pnpm**: Requires a `pnpm-workspace.yaml` at the repo root listing package directories (e.g., `packages: ['packages/*', 'apps/*']`).
- **npm / yarn / bun**: Uses the `workspaces` field in the root `package.json` (e.g., `"workspaces": ["packages/*", "apps/*"]`).

If a newly created package directory isn't covered by these glob patterns, add it before attempting to link.

## Detect Package Manager

Check whether there's a `packageManager` field in the root-level `package.json`.

Alternatively check lockfile in repo root:

- `pnpm-lock.yaml` -> pnpm
- `yarn.lock` -> yarn
- `bun.lock` / `bun.lockb` -> bun
- `package-lock.json` -> npm

## Workflow

1. Identify consumer package (the one importing)
2. Identify provider package(s) (being imported)
3. Add dependency using package manager's workspace syntax
4. Verify symlinks created in consumer's `node_modules/`

---

## pnpm

Uses `workspace:` protocol. This ensures the dependency always resolves to the local workspace copy rather than a published version, which avoids subtle version mismatches.

```bash
# From consumer directory
pnpm add @org/ui --workspace

# Or with --filter from anywhere
pnpm add @org/ui --filter @org/app --workspace
```

Result in `package.json`:

```json
{ "dependencies": { "@org/ui": "workspace:*" } }
```

---

## yarn (v2+ / Berry)

Also uses `workspace:` protocol.

```bash
yarn workspace @org/app add @org/ui
```

Result in `package.json`:

```json
{ "dependencies": { "@org/ui": "workspace:^" } }
```

---

## yarn Classic (v1)

Yarn Classic does not support the `workspace:` protocol. It auto-links workspace packages when the version range in `package.json` matches the local package's version.

```bash
yarn workspace @org/app add @org/ui@*
```

Result in `package.json`:

```json
{ "dependencies": { "@org/ui": "*" } }
```

After adding, run `yarn install` from the repo root to create symlinks. Yarn Classic hoists dependencies to the root `node_modules` by default; use `nohoist` in the root `package.json` if a package needs its own copy:

```json
{
  "workspaces": {
    "packages": ["packages/*"],
    "nohoist": ["**/react-native", "**/react-native/**"]
  }
}
```

To detect Yarn Classic vs Berry: run `yarn --version`. Version 1.x is Classic; 2+ is Berry.

---

## npm

No `workspace:` protocol. npm auto-symlinks workspace packages when the version specifier matches the local package.

```bash
npm install @org/ui --workspace @org/app
```

Result in `package.json`:

```json
{ "dependencies": { "@org/ui": "*" } }
```

npm resolves to local workspace automatically during install.

---

## bun

Supports `workspace:` protocol (pnpm-compatible).

```bash
cd packages/app && bun add @org/ui
```

Result in `package.json`:

```json
{ "dependencies": { "@org/ui": "workspace:*" } }
```

---

## Examples

**Example 1: pnpm - link ui lib to app**

```bash
pnpm add @org/ui --filter @org/app --workspace
```

**Example 2: npm - link multiple packages**

```bash
npm install @org/data-access @org/ui --workspace @org/dashboard
```

**Example 3: Debug "Cannot find module"**

1. Check if dependency is declared in consumer's `package.json`
2. If not, add it using appropriate command above
3. Run install (`pnpm install`, `npm install`, etc.)

## Notes

- Symlinks appear in `<consumer>/node_modules/@org/<package>`
- The `workspace:*` protocol (pnpm, yarn berry, bun) is preferable to bare `*` because it makes the workspace relationship explicit in `package.json` and prevents accidental resolution to a registry version.
- **Hoisting differs by manager:**
  - npm/bun: hoist shared deps to root `node_modules`
  - pnpm: no hoisting (strict isolation, prevents phantom deps)
  - yarn berry: uses Plug'n'Play by default (no `node_modules`)
  - yarn classic: hoists to root, configurable via `nohoist`
- Root `package.json` should have `"private": true` to prevent accidental publish

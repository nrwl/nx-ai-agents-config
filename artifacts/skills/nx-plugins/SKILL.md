---
name: nx-plugins
description: >
  Find, install, and manage Nx plugins. Use when the user wants to discover
  available plugins, add support for a new framework or technology, explore what
  a plugin provides (generators, executors, graph plugins), or troubleshoot
  plugin-related issues. Common triggers: 'add React support', 'what plugins are
  available', 'install @nx/...', 'add framework support'.
---

# Nx Plugins

Nx plugins extend your workspace with support for specific frameworks, languages, and tools. A plugin can provide:

- **Generators** - scaffold projects, components, and configuration (see the `nx-generate` skill)
- **Executors** - define how tasks like `build`, `test`, `serve` are run
- **Graph plugins** - automatically detect dependencies between projects
- **Migrations** - automate code and config updates when upgrading versions

## Discovering Plugins

### List all available plugins

```bash
nx list
```

This shows both installed plugins and a curated list of available official (`@nx/...`) and community plugins you can add.

### Explore a specific plugin

```bash
nx list <plugin>
```

For example:

```bash
nx list @nx/react
```

This displays all generators and executors the plugin provides, which is useful for understanding what capabilities it adds.

## Installing Plugins

### Use `nx add` (recommended)

```bash
nx add <plugin>
```

For example:

```bash
nx add @nx/react
```

Always prefer `nx add` over manually installing the package. `nx add` does more than just install the npm package:

1. Installs the plugin package as a dependency
2. Runs the plugin's `init` generator, which sets up default configuration in `nx.json`, adds presets, and wires up any necessary tooling
3. Registers the plugin so Nx can discover its graph plugins, executors, and generators

Manually installing with your package manager (`npm install`, `pnpm add`, `yarn add`) skips steps 2 and 3, which often leads to incomplete setup.

### Verify installation

After installing, confirm the plugin is registered:

```bash
nx list
```

Installed plugins appear at the top of the output. You can also check `nx.json` to see if the plugin was added to the `plugins` array (not all plugins require this).

## Common Nx Plugins

| Plugin           | Purpose                            |
| ---------------- | ---------------------------------- |
| `@nx/react`      | React applications and libraries   |
| `@nx/angular`    | Angular applications and libraries |
| `@nx/next`       | Next.js applications               |
| `@nx/nest`       | NestJS applications                |
| `@nx/node`       | Node.js applications and libraries |
| `@nx/express`    | Express applications               |
| `@nx/vue`        | Vue applications and libraries     |
| `@nx/nuxt`       | Nuxt applications                  |
| `@nx/web`        | Generic web applications           |
| `@nx/vite`       | Vite-based build and test          |
| `@nx/webpack`    | Webpack-based build                |
| `@nx/rspack`     | Rspack-based build                 |
| `@nx/esbuild`    | esbuild-based build                |
| `@nx/rollup`     | Rollup-based build                 |
| `@nx/jest`       | Jest testing                       |
| `@nx/vitest`     | Vitest testing                     |
| `@nx/cypress`    | Cypress e2e testing                |
| `@nx/playwright` | Playwright e2e testing             |
| `@nx/eslint`     | ESLint linting                     |
| `@nx/storybook`  | Storybook integration              |
| `@nx/js`         | TypeScript/JavaScript libraries    |

This is not exhaustive. Run `nx list` to see the full set of available plugins, including community plugins.

## Troubleshooting

### Plugin not detected after install

If a plugin was installed manually (not via `nx add`), it may not be fully initialized. Try running the init generator:

```bash
nx g <plugin>:init
```

For example:

```bash
nx g @nx/react:init
```

### Stale plugin state

After adding or removing plugins, Nx may have cached stale state. Reset the Nx daemon and cache:

```bash
nx reset
```

Then retry your command.

### Plugin version mismatch

All `@nx/` packages should be on the same version as the `nx` package itself. Version mismatches can cause subtle failures. Check versions with:

```bash
nx report
```

If versions are misaligned, update them together. The `nx migrate` command handles this:

```bash
nx migrate latest
```

## Package Manager Note

The examples above use bare `nx` commands. If `nx` is not on your PATH (not installed globally), prefix commands with your workspace's package runner. Detect the package manager from the lockfile in the workspace root:

- `package-lock.json` -> use `npx nx ...`
- `pnpm-lock.yaml` -> use `pnpm nx ...` or `pnpx nx ...`
- `yarn.lock` -> use `yarn nx ...`
- `bun.lock` / `bun.lockb` -> use `bunx nx ...`

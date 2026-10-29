# Contributing

Skills live in `plugins/nx/skills` and `plugins/nx-cloud/skills`. Edit the `SKILL.md` files directly; there is no build step. See [AGENTS.md](./AGENTS.md) for how the plugins are laid out and which files older Nx versions still read.

Before opening a pull request, run:

```sh
npx nx test
npx nx validate-cursor-plugin
claude plugin validate plugins
```

To try your changes, load a plugin from your checkout:

- Claude Code: `claude --plugin-dir plugins/nx --plugin-dir plugins/nx-cloud`
- Codex: `codex plugin marketplace add .`, then `codex plugin add nx@nx-plugins` and `codex plugin add nx-cloud@nx-plugins`
- Cursor: `cursor-agent --plugin-dir plugins/nx --plugin-dir plugins/nx-cloud`

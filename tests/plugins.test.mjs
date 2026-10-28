import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';

const rootDir = join(import.meta.dirname, '..');
const pluginsDir = join(rootDir, 'plugins');

const readJson = (path) =>
  JSON.parse(readFileSync(join(rootDir, path), 'utf-8'));

const pluginNames = readdirSync(pluginsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
  .map((entry) => entry.name)
  .sort();

function skillsOf(plugin) {
  const dir = join(pluginsDir, plugin, 'skills');
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      dir: join(dir, entry.name),
      content: readFileSync(join(dir, entry.name, 'SKILL.md'), 'utf-8'),
    }));
}

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function frontmatter(content) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!match) return null;
  return Object.fromEntries(
    match[1]
      .split('\n')
      .map((line) => /^([a-z-]+):\s*(.*)$/.exec(line))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^"(.*)"$/, '$1')])
  );
}

describe('plugins', () => {
  it('lists every plugin in both marketplaces', () => {
    const claude = readJson('plugins/.claude-plugin/marketplace.json');
    expect(claude.plugins.map((p) => [p.name, p.source]).sort()).toEqual(
      pluginNames.map((name) => [name, `./${name}`])
    );

    const codex = readJson('.agents/plugins/marketplace.json');
    expect(codex.name).toBe(claude.name);
    expect(codex.plugins.map((p) => [p.name, p.source.path]).sort()).toEqual(
      pluginNames.map((name) => [name, `./plugins/${name}`])
    );
  });

  describe.each(pluginNames)('%s', (plugin) => {
    const base = `plugins/${plugin}`;

    it('has matching Claude Code and Agent Plugins manifests', () => {
      const claude = readJson(`${base}/.claude-plugin/plugin.json`);
      const { $schema, ...portable } = readJson(`${base}/plugin.json`);
      expect($schema).toBe(
        'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
      );
      expect(portable).toEqual(claude);
      expect(claude.name).toBe(plugin);
      // Without a version, Claude Code installs track the commit.
      expect(claude.version).toBeUndefined();
    });

    it('declares the same MCP servers for Claude Code and Agent Plugins', () => {
      const claude = readJson(`${base}/.mcp.json`).mcpServers;
      const { $schema, mcpServers } = readJson(`${base}/mcp.json`);
      expect($schema).toBe(
        'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'
      );
      const asClaude = Object.fromEntries(
        Object.entries(mcpServers).map(([name, server]) => [
          name,
          server.type === 'streamable-http'
            ? { ...server, type: 'http' }
            : server,
        ])
      );
      expect(asClaude).toEqual(claude);
    });

    it.each(skillsOf(plugin).map((skill) => [skill.name, skill]))(
      'skill %s has portable frontmatter',
      (name, skill) => {
        const meta = frontmatter(skill.content);
        expect(meta).not.toBeNull();
        expect(Object.keys(meta).sort()).toEqual(['description', 'name']);
        expect(meta.name).toBe(name);
        expect(meta.description.length).toBeGreaterThan(0);
      }
    );

    it('has no agent-specific templating or placeholders', () => {
      for (const file of filesUnder(join(rootDir, base, 'skills'))) {
        const content = readFileSync(file, 'utf-8');
        expect(content, file).not.toMatch(/\{%|\$ARGUMENTS|!`|mcp__/);
      }
    });
  });

  it('keeps the skills of the two plugins apart', () => {
    const names = pluginNames.flatMap((plugin) =>
      skillsOf(plugin).map((skill) => skill.name)
    );
    expect(new Set(names).size).toBe(names.length);
  });
});

// Nx 23 and older clone the default branch and copy these into workspaces,
// and their Claude Code setup installs `nx@nx-claude-plugins`.
describe('files older Nx versions read', () => {
  it.each([
    'generated/.agents/skills',
    'generated/.opencode',
    'generated/.github',
    'generated/.cursor',
    'generated/.codex/agents',
    'generated/.codex/config.toml',
    'generated/.gemini',
  ])('%s exists', (path) => {
    expect(existsSync(join(rootDir, path))).toBe(true);
  });

  // Codex starts plugin MCP servers outside the workspace, so workspaces rely
  // on this entry, which nx writes to .codex/config.toml, overriding the nx
  // plugin's server of the same name.
  it('declares the nx MCP server for Codex workspaces under the same name', () => {
    const config = parseToml(
      readFileSync(join(rootDir, 'generated/.codex/config.toml'), 'utf-8')
    );
    const { type, ...server } = readJson('plugins/nx/mcp.json').mcpServers[
      'nx-mcp'
    ];
    expect(type).toBe('stdio');
    expect(config.mcp_servers['nx-mcp']).toEqual(server);
  });

  it('keeps the nx plugin in the nx-claude-plugins marketplace', () => {
    const marketplace = readJson('.claude-plugin/marketplace.json');
    expect(marketplace.name).toBe('nx-claude-plugins');
    expect(marketplace.plugins.map((p) => p.name)).toContain('nx');
  });
});

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PACKAGE_NAMES,
  packagePlugins,
  readPluginManifest,
} from '../scripts/package-plugins.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

describe('packagePlugins', () => {
  let distDir;
  const { version } = readPluginManifest();

  beforeAll(() => {
    distDir = join(mkdtempSync(join(tmpdir(), 'nx-plugins-')), 'dist');
    packagePlugins(distDir);
  });

  afterAll(() => {
    rmSync(join(distDir, '..'), { recursive: true, force: true });
  });

  it.each(Object.entries(PACKAGE_NAMES))(
    'builds %s as a public package at the plugin version',
    (agent, name) => {
      const pkg = readJson(join(distDir, agent, 'package.json'));
      expect(pkg.name).toBe(name);
      expect(pkg.version).toBe(version);
      expect(pkg.publishConfig).toEqual({ access: 'public' });
      for (const entry of pkg.files) {
        expect(existsSync(join(distDir, agent, entry))).toBe(true);
      }
    }
  );

  it('ships the Claude plugin manifest, skills and the guidelines hook', () => {
    const dir = join(distDir, 'claude');
    expect(readJson(join(dir, '.claude-plugin', 'plugin.json'))).toEqual(
      readPluginManifest()
    );
    expect(existsSync(join(dir, 'skills', 'nx-workspace', 'SKILL.md'))).toBe(
      true
    );
    const hooks = readJson(join(dir, 'hooks', 'hooks.json'));
    expect(hooks.hooks.SessionStart[0].hooks[0].command).toContain(
      '${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs'
    );
    expect(existsSync(join(dir, 'hooks', 'nx-guidelines.md'))).toBe(true);
  });

  it('ships a Codex manifest whose paths resolve inside the package', () => {
    const dir = join(distDir, 'codex');
    const manifest = readJson(join(dir, '.codex-plugin', 'plugin.json'));
    expect(manifest.name).toBe('nx');
    expect(manifest.version).toBe(version);
    for (const key of ['skills', 'mcpServers', 'hooks']) {
      expect(existsSync(join(dir, manifest[key]))).toBe(true);
    }
    expect(readJson(join(dir, '.mcp.json')).mcpServers['nx-mcp']).toEqual({
      command: 'npx',
      args: ['nx-mcp@latest', '--minimal'],
    });
    expect(readJson(join(dir, 'package.json')).bin).toEqual({
      'nx-codex-plugin': 'bin/nx-codex-plugin.mjs',
    });
  });

  it('ships the OpenCode plugin entry with its runtime dependency', () => {
    const dir = join(distDir, 'opencode');
    const pkg = readJson(join(dir, 'package.json'));
    expect(pkg.main).toBe('./server.js');
    expect(pkg.dependencies).toHaveProperty('js-yaml');
    expect(existsSync(join(dir, 'commands', 'monitor-ci.md'))).toBe(true);
    expect(existsSync(join(dir, 'agents', 'ci-monitor-subagent.md'))).toBe(
      true
    );
  });
});

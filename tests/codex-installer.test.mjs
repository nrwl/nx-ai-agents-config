import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkInstall,
  getCodexCachePath,
  installPlugin,
  PLUGIN_ID,
  removeTomlTable,
} from '../plugins/codex/lib/installer.mjs';

describe('removeTomlTable', () => {
  it('removes the table and its subtables, keeping everything else', () => {
    const input = [
      '# my settings',
      'model = "o3"',
      '',
      '[plugins."nx@nx-agent-plugins"]',
      'enabled = true',
      '',
      '[plugins."nx@nx-agent-plugins".options]',
      'foo = 1',
      '',
      '[plugins."other@market"]',
      'enabled = true',
      '',
    ].join('\n');

    expect(removeTomlTable(input, `plugins."${PLUGIN_ID}"`)).toBe(
      [
        '# my settings',
        'model = "o3"',
        '',
        '[plugins."other@market"]',
        'enabled = true',
        '',
      ].join('\n')
    );
  });

  it('leaves the text untouched when the table is absent', () => {
    const input =
      'model = "o3"\n\n\n\n[projects."/repo"]\ntrust_level = "trusted"\n';
    expect(removeTomlTable(input, `plugins."${PLUGIN_ID}"`)).toBe(input);
  });

  it('only touches the lines of the removed table', () => {
    const input = [
      '[a]',
      'x = 1',
      '[plugins."nx@nx-agent-plugins"]',
      'enabled = true',
      '[b]',
      'y = 2',
      '',
    ].join('\n');
    expect(removeTomlTable(input, `plugins."${PLUGIN_ID}"`)).toBe(
      ['[a]', 'x = 1', '[b]', 'y = 2', ''].join('\n')
    );
  });
});

describe('installPlugin', () => {
  let root;
  let packageRoot;
  let env;

  const writeJson = (path, value) => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(value));
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nx-codex-'));
    packageRoot = join(root, 'pkg');
    env = { HOME: join(root, 'home'), CODEX_HOME: join(root, 'codex') };
    writeJson(join(packageRoot, 'package.json'), {
      name: '@nx/codex-plugin',
      version: '1.2.3',
      files: ['.codex-plugin/', 'skills/'],
    });
    writeJson(join(packageRoot, '.codex-plugin', 'plugin.json'), {
      name: 'nx',
      version: '1.2.3',
    });
    mkdirSync(join(packageRoot, 'skills', 'nx-workspace'), { recursive: true });
    writeFileSync(join(packageRoot, 'skills', 'nx-workspace', 'SKILL.md'), '');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // Mimics the Codex CLI: `plugin add` caches the plugin and enables it in
  // the user config.
  const fakeCodex = (calls) => (args) => {
    calls.push(args.join(' '));
    if (args[1] === 'add') {
      mkdirSync(
        join(getCodexCachePath(env.CODEX_HOME, '1.2.3'), '.codex-plugin'),
        {
          recursive: true,
        }
      );
      writeFileSync(
        join(
          getCodexCachePath(env.CODEX_HOME, '1.2.3'),
          '.codex-plugin',
          'plugin.json'
        ),
        '{}'
      );
      writeFileSync(
        join(env.CODEX_HOME, 'config.toml'),
        `model = "o3"\n\n[plugins."${PLUGIN_ID}"]\nenabled = true\n`
      );
    }
    return { ok: true };
  };

  it('caches the plugin without leaving it enabled for the user', () => {
    mkdirSync(env.CODEX_HOME, { recursive: true });
    const calls = [];

    const result = installPlugin({ packageRoot, env, codex: fakeCodex(calls) });

    expect(result).toMatchObject({
      ok: true,
      version: '1.2.3',
      userEntryRemoved: true,
    });
    expect(calls).toEqual([
      `plugin marketplace add ${join(env.HOME, '.nx', 'codex-marketplace')}`,
      `plugin add ${PLUGIN_ID}`,
    ]);
    expect(readFileSync(join(env.CODEX_HOME, 'config.toml'), 'utf8')).toBe(
      'model = "o3"\n'
    );
    const marketplace = JSON.parse(
      readFileSync(
        join(
          env.HOME,
          '.nx',
          'codex-marketplace',
          '.agents',
          'plugins',
          'marketplace.json'
        ),
        'utf8'
      )
    );
    expect(marketplace.name).toBe('nx-agent-plugins');
    expect(marketplace.plugins[0].source).toEqual({
      source: 'local',
      path: './plugins/nx',
    });
    expect(
      existsSync(
        join(
          env.HOME,
          '.nx',
          'codex-marketplace',
          'plugins',
          'nx',
          'skills',
          'nx-workspace',
          'SKILL.md'
        )
      )
    ).toBe(true);
    expect(checkInstall({ packageRoot, env }).ok).toBe(true);
  });

  it('keeps a global enable the user already had', () => {
    mkdirSync(env.CODEX_HOME, { recursive: true });
    writeFileSync(
      join(env.CODEX_HOME, 'config.toml'),
      `[plugins."${PLUGIN_ID}"]\nenabled = true\n`
    );

    const result = installPlugin({ packageRoot, env, codex: fakeCodex([]) });

    expect(result).toMatchObject({ ok: true, userEntryRemoved: false });
    expect(readFileSync(join(env.CODEX_HOME, 'config.toml'), 'utf8')).toContain(
      `[plugins."${PLUGIN_ID}"]`
    );
  });

  it('reports a missing Codex CLI instead of throwing', () => {
    const result = installPlugin({
      packageRoot,
      env,
      codex: () => ({ ok: false, missing: true, error: 'spawn codex ENOENT' }),
    });

    expect(result).toMatchObject({ ok: false, codexAvailable: false });
    expect(result.error).toContain('Codex CLI not found');
    expect(checkInstall({ packageRoot, env }).ok).toBe(false);
  });
});

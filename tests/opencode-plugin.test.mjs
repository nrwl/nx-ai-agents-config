import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyNxConfig,
  loadAgents,
  loadCommands,
  NX_MCP_SERVER,
} from '../plugins/opencode/lib/config.mjs';
import * as serverModule from '../plugins/opencode/server.js';

const opencodeDir = join(import.meta.dirname, '..', 'generated', '.opencode');

describe('OpenCode plugin', () => {
  let workspace;
  const options = () => ({
    skillsDir: '/pkg/skills',
    agents: loadAgents(join(opencodeDir, 'agents')),
    commands: loadCommands(join(opencodeDir, 'commands')),
    guidelinesPath: '/pkg/nx-guidelines.md',
    directory: workspace,
  });

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'nx-opencode-'));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('exports only plugin factories', () => {
    expect(Object.keys(serverModule).sort()).toEqual(['NxPlugin', 'default']);
  });

  it('loads the generated subagents and commands', () => {
    const { agents, commands } = options();
    expect(agents['ci-monitor-subagent']).toMatchObject({ mode: 'subagent' });
    expect(agents['ci-monitor-subagent'].prompt).toContain('CI helper');
    expect(commands['monitor-ci'].template).toContain('Monitor CI Command');
    expect(commands['monitor-ci'].description).toBeTruthy();
  });

  it('registers skills, agents, commands, the MCP server and guidelines in Nx workspaces', () => {
    writeFileSync(join(workspace, 'nx.json'), '{}');
    mkdirSync(join(workspace, 'apps', 'web'), { recursive: true });

    const cfg = applyNxConfig(
      {},
      { ...options(), directory: join(workspace, 'apps', 'web') }
    );

    expect(cfg.skills.paths).toEqual(['/pkg/skills']);
    expect(cfg.agent).toHaveProperty('ci-monitor-subagent');
    expect(cfg.command).toHaveProperty('monitor-ci');
    expect(cfg.mcp['nx-mcp']).toEqual(NX_MCP_SERVER);
    expect(cfg.instructions).toEqual(['/pkg/nx-guidelines.md']);
  });

  it('keeps user configuration and skips guidelines outside Nx workspaces', () => {
    const userMcp = {
      type: 'local',
      command: ['npx', 'nx', 'mcp'],
      enabled: true,
    };
    const cfg = applyNxConfig(
      {
        mcp: { 'nx-mcp': userMcp },
        agent: { 'ci-monitor-subagent': { mode: 'primary' } },
      },
      options()
    );

    expect(cfg.mcp['nx-mcp']).toBe(userMcp);
    expect(cfg.agent['ci-monitor-subagent']).toEqual({ mode: 'primary' });
    expect(cfg.instructions).toBeUndefined();
  });

  it('is idempotent', () => {
    writeFileSync(join(workspace, 'nx.json'), '{}');
    const cfg = applyNxConfig(applyNxConfig({}, options()), options());
    expect(cfg.skills.paths).toEqual(['/pkg/skills']);
    expect(cfg.instructions).toEqual(['/pkg/nx-guidelines.md']);
  });
});

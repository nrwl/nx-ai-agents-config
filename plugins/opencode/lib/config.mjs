import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export const NX_MCP_SERVER = {
  type: 'local',
  command: ['npx', 'nx-mcp@latest', '--minimal'],
  enabled: true,
};

export function parseFrontmatter(raw, fileName) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { data: {}, content: raw };
  }
  let data;
  try {
    data = yaml.load(match[1]) ?? {};
  } catch (error) {
    throw new Error(`Invalid frontmatter in ${fileName}: ${error.message}`);
  }
  return { data, content: raw.slice(match[0].length) };
}

function readMarkdownEntries(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => {
      const raw = readFileSync(path.join(dir, entry.name), 'utf8');
      return {
        name: path.basename(entry.name, '.md'),
        ...parseFrontmatter(raw, entry.name),
      };
    });
}

export function loadAgents(agentsDir) {
  const agents = {};
  for (const { name, data, content } of readMarkdownEntries(agentsDir)) {
    if (typeof data.description !== 'string' || !data.description) {
      throw new Error(`OpenCode agent ${name} must define a description`);
    }
    agents[name] = {
      mode: typeof data.mode === 'string' ? data.mode : 'subagent',
      description: data.description,
      prompt: content.trim(),
    };
  }
  return agents;
}

export function loadCommands(commandsDir) {
  const commands = {};
  for (const { name, data, content } of readMarkdownEntries(commandsDir)) {
    commands[name] = {
      template: content.trim(),
      ...(typeof data.description === 'string'
        ? { description: data.description }
        : {}),
    };
  }
  return commands;
}

export function findNxWorkspaceRoot(startDir) {
  if (!startDir) {
    return null;
  }
  let dir = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(dir, 'nx.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * Merge the Nx plugin contributions into the resolved OpenCode config.
 * Entries the user configured themselves win over the plugin's defaults.
 */
export function applyNxConfig(
  cfg,
  { skillsDir, agents, commands, guidelinesPath, directory }
) {
  cfg.skills ??= {};
  cfg.skills.paths ??= [];
  if (!cfg.skills.paths.includes(skillsDir)) {
    cfg.skills.paths.push(skillsDir);
  }

  cfg.agent ??= {};
  for (const [name, agent] of Object.entries(agents)) {
    cfg.agent[name] ??= agent;
  }

  cfg.command ??= {};
  for (const [name, command] of Object.entries(commands)) {
    cfg.command[name] ??= command;
  }

  cfg.mcp ??= {};
  cfg.mcp['nx-mcp'] ??= { ...NX_MCP_SERVER };

  if (findNxWorkspaceRoot(directory)) {
    cfg.instructions ??= [];
    if (!cfg.instructions.includes(guidelinesPath)) {
      cfg.instructions.push(guidelinesPath);
    }
  }

  return cfg;
}

import {
  cpSync,
  rmSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'fs';
import { join, basename, dirname } from 'path';
import { execSync } from 'child_process';
import yaml from 'js-yaml';
import * as TOML from 'smol-toml';

const rootDir = join(import.meta.dirname, '..');
const artifactsDir = join(rootDir, 'artifacts');
const generatedDir = join(rootDir, 'generated');

// Agent output configurations
const agents = {
  claude: {
    outputDir: rootDir,
    agentsDir: 'agents',
    agentsExt: '.md',
    commandsDir: 'commands',
    commandsExt: '.md',
    skillsDir: 'skills',
    skillsFile: 'SKILL.md',
    supportsAgents: true,
    argumentsPlaceholder: '$ARGUMENTS', // no change
    writeAgent: writeClaudeAgent,
    writeCommand: writeClaudeCommand,
    writeSkill: writeClaudeSkill,
  },
  opencode: {
    outputDir: join(generatedDir, '.opencode'),
    agentsDir: 'agents',
    agentsExt: '.md',
    commandsDir: 'commands',
    commandsExt: '.md',
    skillsDir: 'skills',
    skillsFile: 'SKILL.md',
    supportsAgents: true,
    argumentsPlaceholder: '$ARGUMENTS', // no change
    writeAgent: writeOpenCodeAgent,
    writeCommand: writeOpenCodeCommand,
    writeSkill: writeBasicSkill,
  },
  copilot: {
    outputDir: join(generatedDir, '.github'),
    agentsDir: 'agents',
    agentsExt: '.agent.md',
    commandsDir: 'prompts',
    commandsExt: '.prompt.md',
    skillsDir: 'skills',
    skillsFile: 'SKILL.md',
    supportsAgents: true,
    argumentsPlaceholder: '${input:args}',
    writeAgent: writeCopilotAgent,
    writeCommand: writeCopilotCommand,
    writeSkill: writeBasicSkill,
  },
  cursor: {
    outputDir: join(generatedDir, '.cursor'),
    agentsDir: 'agents',
    agentsExt: '.md',
    commandsDir: 'commands',
    commandsExt: '.md',
    skillsDir: 'skills',
    skillsFile: 'SKILL.md',
    supportsAgents: true,
    argumentsPlaceholder: null, // strip entirely
    writeAgent: writeCursorAgent,
    writeCommand: writeCursorCommand,
    writeSkill: writeBasicSkill,
  },
  gemini: {
    outputDir: join(generatedDir, '.gemini'),
    agentsDir: null, // Gemini doesn't support agents
    agentsExt: null,
    commandsDir: 'commands',
    commandsExt: '.toml',
    skillsDir: 'skills',
    skillsFile: 'skill.md', // Lowercase for Gemini
    supportsAgents: false,
    argumentsPlaceholder: '{{args}}',
    writeAgent: null,
    writeCommand: writeGeminiCommand,
    writeSkill: writeGeminiSkill,
  },
};

/**
 * Read artifact content and metadata from sidecar JSON file
 */
function readArtifact(mdPath) {
  const content = readFileSync(mdPath, 'utf-8');
  const metaPath = mdPath + '.meta.json';
  const meta = existsSync(metaPath)
    ? JSON.parse(readFileSync(metaPath, 'utf-8'))
    : {};
  return { content, meta };
}

/**
 * Serialize metadata to YAML frontmatter format
 */
function serializeYamlFrontmatter(meta) {
  const yamlContent = yaml.dump(meta, {
    lineWidth: -1,
    quotingType: "'",
    forceQuotes: false,
  });
  return `---\n${yamlContent}---\n`;
}

/**
 * Transform $ARGUMENTS placeholder to agent-specific syntax
 */
function transformArguments(content, targetPlaceholder) {
  if (targetPlaceholder === null) {
    // Remove entire lines containing $ARGUMENTS (they don't make sense without argument support)
    return content.replace(/^.*\$ARGUMENTS.*$\n?/gm, '');
  }
  if (targetPlaceholder === '$ARGUMENTS') {
    return content; // no change needed
  }
  return content.replace(/\$ARGUMENTS/g, targetPlaceholder);
}

/**
 * Validate required fields in metadata
 */
function validateAgentMeta(meta, filePath) {
  const missing = [];
  if (!meta.name) missing.push('name');
  if (!meta.description) missing.push('description');
  if (missing.length > 0) {
    throw new Error(
      `Missing required fields in ${filePath}.meta.json: ${missing.join(', ')}`
    );
  }
}

function validateSkillMeta(meta, filePath) {
  const missing = [];
  if (!meta.description) missing.push('description');
  if (missing.length > 0) {
    throw new Error(
      `Missing required fields in ${filePath}.meta.json: ${missing.join(', ')}`
    );
  }
}

// ============== Writer Functions ==============

/**
 * Write Claude agent (YAML frontmatter + markdown)
 */
function writeClaudeAgent(destPath, content, meta) {
  const frontmatter = {
    name: meta.name,
    description: meta.description,
  };
  if (meta.model) frontmatter.model = meta.model;
  if (meta['allowed-tools'])
    frontmatter['allowed-tools'] = meta['allowed-tools'];

  const output = serializeYamlFrontmatter(frontmatter) + content;
  writeFileSync(destPath, output);
}

/**
 * Write Claude command (YAML frontmatter + markdown)
 */
function writeClaudeCommand(destPath, content, meta, config) {
  const frontmatter = {};
  if (meta.description) frontmatter.description = meta.description;
  if (meta['argument-hint'])
    frontmatter['argument-hint'] = meta['argument-hint'];
  if (meta['allowed-tools'])
    frontmatter['allowed-tools'] = meta['allowed-tools'];

  const transformedContent = transformArguments(
    content,
    config.argumentsPlaceholder
  );
  const output = serializeYamlFrontmatter(frontmatter) + transformedContent;
  writeFileSync(destPath, output);
}

/**
 * Write OpenCode command (YAML frontmatter + markdown, without allowed-tools)
 */
function writeOpenCodeCommand(destPath, content, meta, config) {
  const frontmatter = {};
  if (meta.description) frontmatter.description = meta.description;
  if (meta['argument-hint'])
    frontmatter['argument-hint'] = meta['argument-hint'];

  const transformedContent = transformArguments(
    content,
    config.argumentsPlaceholder
  );
  const output = serializeYamlFrontmatter(frontmatter) + transformedContent;
  writeFileSync(destPath, output);
}

/**
 * Write Claude skill (YAML frontmatter + markdown)
 * Supports Claude-specific features: user-invocable commands, subagent spawning
 */
function writeClaudeSkill(destPath, content, meta, config) {
  const frontmatter = {};
  if (meta.name) frontmatter.name = meta.name;
  if (meta.description) frontmatter.description = meta.description;

  // Claude-specific: command skills get user-invocable: true
  if (meta.command) {
    frontmatter['user-invocable'] = true;
    if (meta['argument-hint'])
      frontmatter['argument-hint'] = meta['argument-hint'];
    if (meta['allowed-tools'])
      frontmatter['allowed-tools'] = meta['allowed-tools'];
  }

  // Claude-specific: subagent field - true maps to 'general-purpose', string passes through
  if (meta.subagent) {
    frontmatter.subagent =
      meta.subagent === true ? 'general-purpose' : meta.subagent;
    frontmatter.context = 'fork';
  }

  const transformedContent = meta.command
    ? transformArguments(content, config.argumentsPlaceholder)
    : content;
  const output = serializeYamlFrontmatter(frontmatter) + transformedContent;
  writeFileSync(destPath, output);
}

/**
 * Write basic skill (YAML frontmatter with name/description + markdown)
 * Used by agents that don't have special skill features
 */
function writeBasicSkill(destPath, content, meta) {
  const frontmatter = {};
  if (meta.name) frontmatter.name = meta.name;
  if (meta.description) frontmatter.description = meta.description;

  const output = serializeYamlFrontmatter(frontmatter) + content;
  writeFileSync(destPath, output);
}

/**
 * Write OpenCode agent (YAML frontmatter + markdown)
 * Note: OpenCode derives agent name from filename, not frontmatter.
 * e.g., `nx-ci-monitor.md` → agent invoked with `@nx-ci-monitor`
 */
function writeOpenCodeAgent(destPath, content, meta) {
  const frontmatter = {
    description: meta.description || '',
    mode: 'subagent',
  };

  const output = serializeYamlFrontmatter(frontmatter) + content;
  writeFileSync(destPath, output);
}

/**
 * Write Copilot agent (YAML frontmatter + markdown)
 */
function writeCopilotAgent(destPath, content, meta) {
  const frontmatter = {
    description: meta.description || '',
  };

  const output = serializeYamlFrontmatter(frontmatter) + content;
  writeFileSync(destPath, output);
}

/**
 * Write Copilot command (YAML frontmatter + markdown with ${input:args})
 */
function writeCopilotCommand(destPath, content, meta, config) {
  const frontmatter = {};
  if (meta.description) frontmatter.description = meta.description;
  if (meta['argument-hint'])
    frontmatter['argument-hint'] = meta['argument-hint'];

  const transformedContent = transformArguments(
    content,
    config.argumentsPlaceholder
  );
  const output = serializeYamlFrontmatter(frontmatter) + transformedContent;
  writeFileSync(destPath, output);
}

/**
 * Map source model names to Cursor model format
 * - haiku → fast (lightweight, quick responses)
 * - sonnet/opus → inherit (use default capable model)
 * - Unknown models pass through (allows explicit Cursor model IDs)
 */
function mapModelToCursor(sourceModel) {
  const modelMap = {
    haiku: 'fast',
    sonnet: 'inherit',
    opus: 'inherit',
  };
  return modelMap[sourceModel] || sourceModel;
}

/**
 * Write Cursor agent (YAML frontmatter + markdown)
 */
function writeCursorAgent(destPath, content, meta) {
  const frontmatter = {};

  if (meta.name) frontmatter.name = meta.name;
  if (meta.description) frontmatter.description = meta.description;

  // Map source model to Cursor model format
  if (meta.model) {
    frontmatter.model = mapModelToCursor(meta.model);
  }

  // Pass through Cursor-specific fields if present
  if (meta.readonly !== undefined) frontmatter.readonly = meta.readonly;
  if (meta.is_background !== undefined)
    frontmatter.is_background = meta.is_background;

  const output = serializeYamlFrontmatter(frontmatter) + content;
  writeFileSync(destPath, output);
}

/**
 * Write Cursor command (plain markdown, no frontmatter, $ARGUMENTS stripped)
 */
function writeCursorCommand(destPath, content, meta, config) {
  const transformedContent = transformArguments(
    content,
    config.argumentsPlaceholder
  );
  writeFileSync(destPath, transformedContent);
}

/**
 * Convert single-line TOML string to multiline format
 * Transforms: key = "line1\nline2" -> key = """\nline1\nline2"""
 */
function toMultilineTomlString(tomlOutput, key) {
  const regex = new RegExp(`^(${key} = )"(.*)"$`, 'm');
  return tomlOutput.replace(regex, (match, prefix, content) => {
    // Unescape \n to actual newlines and \" to " (quotes don't need escaping in multiline strings)
    const unescaped = content.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    return `${prefix}"""\n${unescaped}"""`;
  });
}

/**
 * Write Gemini command (TOML format with {{args}})
 */
function writeGeminiCommand(destPath, content, meta, config) {
  const tomlObj = {};

  if (meta.description) {
    tomlObj.description = meta.description;
  }

  const transformedContent = transformArguments(
    content,
    config.argumentsPlaceholder
  );
  const trimmedContent = transformedContent.trim();
  if (trimmedContent) {
    tomlObj.prompt = trimmedContent;
  }

  let tomlOutput = TOML.stringify(tomlObj);

  // Convert prompt to multiline string for readability
  if (tomlObj.prompt) {
    tomlOutput = toMultilineTomlString(tomlOutput, 'prompt');
  }

  writeFileSync(destPath, tomlOutput);
}

/**
 * Write Gemini skill (YAML frontmatter + markdown)
 */
function writeGeminiSkill(destPath, content, meta) {
  const frontmatter = {};
  if (meta.name) frontmatter.name = meta.name;
  if (meta.description) frontmatter.description = meta.description;

  const output = serializeYamlFrontmatter(frontmatter) + content;
  writeFileSync(destPath, output);
}

// ============== Utility Functions ==============

/**
 * Clear and recreate a directory
 */
function recreateDir(dir) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true });
  }
  mkdirSync(dir, { recursive: true });
}

/**
 * Clean Claude plugin output at repo root before regenerating.
 * Removes generated dirs/files but preserves marketplace.json.
 */
function cleanClaudeRootOutput() {
  for (const dir of ['skills', 'agents']) {
    const p = join(rootDir, dir);
    if (existsSync(p)) rmSync(p, { recursive: true });
  }
  const mcpJson = join(rootDir, '.mcp.json');
  if (existsSync(mcpJson)) rmSync(mcpJson);
  const pluginJson = join(rootDir, '.claude-plugin', 'plugin.json');
  if (existsSync(pluginJson)) rmSync(pluginJson);
}

/**
 * Copy Claude plugin config files to repo root
 */
function copyClaudePluginConfigs() {
  const claudeConfigDir = join(artifactsDir, 'claude-config');

  // Copy .claude-plugin/plugin.json to root (alongside marketplace.json)
  const pluginJsonSrc = join(claudeConfigDir, '.claude-plugin', 'plugin.json');
  const pluginJsonDest = join(rootDir, '.claude-plugin', 'plugin.json');
  if (existsSync(pluginJsonSrc)) {
    mkdirSync(dirname(pluginJsonDest), { recursive: true });
    cpSync(pluginJsonSrc, pluginJsonDest);
    console.log('  Copied .claude-plugin/plugin.json');
  }

  // Copy .mcp.json to root
  const mcpJsonSrc = join(claudeConfigDir, '.mcp.json');
  const mcpJsonDest = join(rootDir, '.mcp.json');
  if (existsSync(mcpJsonSrc)) {
    cpSync(mcpJsonSrc, mcpJsonDest);
    console.log('  Copied .mcp.json');
  }
}

/**
 * Process agents folder
 */
function processAgents(agentName, config) {
  if (!config.supportsAgents) {
    return;
  }

  const srcDir = join(artifactsDir, 'agents');
  if (!existsSync(srcDir)) {
    console.log(`  Skipped agents/ (source does not exist)`);
    return;
  }

  const destDir = join(config.outputDir, config.agentsDir);
  mkdirSync(destDir, { recursive: true });

  const files = readdirSync(srcDir).filter(
    (f) => f.endsWith('.md') && !f.endsWith('.meta.json')
  );
  for (const file of files) {
    const srcPath = join(srcDir, file);
    const baseName = basename(file, '.md');
    const destPath = join(destDir, baseName + config.agentsExt);

    const { content, meta } = readArtifact(srcPath);
    validateAgentMeta(meta, srcPath);
    if (meta.experimental && !includeExperimental) {
      continue;
    }
    config.writeAgent(destPath, content, meta);
  }

  console.log(`  Processed ${files.length} agent(s) → ${config.agentsDir}/`);
}

/**
 * Process skills folder
 * For Claude: command skills go to skills/ with user-invocable: true
 * For other agents: command skills go to commands/ folder
 */
function processSkills(agentName, config) {
  const srcDir = join(artifactsDir, 'skills');
  if (!existsSync(srcDir)) {
    console.log(`  Skipped skills/ (source does not exist)`);
    return;
  }

  // Skills are in subdirectories: skills/skill-name/SKILL.md
  const skillDirs = readdirSync(srcDir).filter((d) =>
    statSync(join(srcDir, d)).isDirectory()
  );

  let skillCount = 0;
  let commandCount = 0;

  for (const skillDir of skillDirs) {
    const srcSkillFile = join(srcDir, skillDir, 'SKILL.md');
    if (!existsSync(srcSkillFile)) continue;

    const { content, meta } = readArtifact(srcSkillFile);
    validateSkillMeta(meta, srcSkillFile);
    if (meta.experimental && !includeExperimental) {
      continue;
    }

    // Always write as skill
    const destDir = join(config.outputDir, config.skillsDir);
    const destSkillDir = join(destDir, skillDir);
    mkdirSync(destSkillDir, { recursive: true });
    const destSkillFile = join(destSkillDir, config.skillsFile);
    config.writeSkill(destSkillFile, content, meta, config);
    skillCount++;

    // Copy supplementary directories (references/, scripts/, assets/) for on-demand loading
    const srcSkillDir = join(srcDir, skillDir);
    for (const entry of readdirSync(srcSkillDir)) {
      const srcPath = join(srcSkillDir, entry);
      if (statSync(srcPath).isDirectory()) {
        cpSync(srcPath, join(destSkillDir, entry), { recursive: true });
      }
    }

    // For non-Claude agents, also write command skills to commands folder
    if (meta.command && agentName !== 'claude') {
      const cmdDestDir = join(config.outputDir, config.commandsDir);
      mkdirSync(cmdDestDir, { recursive: true });
      const destFile = join(cmdDestDir, skillDir + config.commandsExt);
      config.writeCommand(destFile, content, meta, config);
      commandCount++;
    }
  }

  if (skillCount > 0) {
    console.log(`  Processed ${skillCount} skill(s) → ${config.skillsDir}/`);
  }
  if (commandCount > 0) {
    console.log(
      `  Processed ${commandCount} command(s) → ${config.commandsDir}/`
    );
  }
}

// ============== Main Execution ==============

const isCheckMode = process.argv.includes('--check');
const includeExperimental = process.argv.includes('--include-experimental');

function runSync() {
  console.log('Syncing artifacts...\n');

  // Clean Claude output at repo root (preserves marketplace.json)
  cleanClaudeRootOutput();

  // Clear and recreate generated directory (non-Claude agents only)
  recreateDir(generatedDir);

  // Process each agent
  for (const [agentName, config] of Object.entries(agents)) {
    console.log(`\n[${agentName}] → ${config.outputDir.replace(rootDir, '.')}`);

    mkdirSync(config.outputDir, { recursive: true });

    processAgents(agentName, config);
    processSkills(agentName, config);
  }

  // Copy Claude-specific config files
  console.log('\n[claude] Copying plugin config files...');
  copyClaudePluginConfigs();

  console.log('\nRunning nx format....');
  execSync('npx nx format --fix', { stdio: 'inherit' });

  console.log('\nSync complete!');
}

function runCheck() {
  // Run sync first
  runSync();

  console.log('\nChecking for unstaged changes...');

  // Check for unstaged changes only (working tree vs index)
  const gitDiff = execSync(
    'git diff --name-only generated/ skills/ agents/ .mcp.json .claude-plugin/plugin.json',
    { encoding: 'utf-8' }
  ).trim();

  if (gitDiff) {
    console.error('\nError: Generated files are out of sync with source.');
    console.error(
      "Please run 'npx nx sync-artifacts' and stage the changes.\n"
    );
    console.error('Changed files:');
    console.error(gitDiff);
    console.error('\nDiff:');
    const diff = execSync(
      'git diff generated/ skills/ agents/ .mcp.json .claude-plugin/plugin.json',
      { encoding: 'utf-8' }
    );
    if (diff) console.error(diff);
    process.exit(1);
  }

  console.log('\nAll generated artifacts are up to date!');
}

// Run appropriate mode
if (isCheckMode) {
  runCheck();
} else {
  runSync();
}

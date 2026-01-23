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
    outputDir: join(generatedDir, 'nx-claude-plugin'),
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
    writeCommand: writeClaudeCommand, // Same format as Claude
    writeSkill: writeClaudeSkill, // Same format
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
    writeSkill: writeClaudeSkill, // Same format
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
    writeSkill: writeClaudeSkill, // Same format
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

function validateCommandMeta(meta, filePath) {
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

  const transformedContent = transformArguments(
    content,
    config.argumentsPlaceholder
  );
  const output = serializeYamlFrontmatter(frontmatter) + transformedContent;
  writeFileSync(destPath, output);
}

/**
 * Write Claude skill (YAML frontmatter + markdown)
 */
function writeClaudeSkill(destPath, content, meta) {
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
 * Write Gemini skill (plain markdown, same content)
 */
function writeGeminiSkill(destPath, content, meta) {
  // Gemini skills are plain markdown with frontmatter
  writeClaudeSkill(destPath, content, meta);
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
 * Copy Claude plugin config files
 */
function copyClaudePluginConfigs() {
  const claudeOutputDir = agents.claude.outputDir;
  const claudeConfigDir = join(artifactsDir, 'claude-config');

  // Copy .claude-plugin/plugin.json
  const pluginJsonSrc = join(claudeConfigDir, '.claude-plugin', 'plugin.json');
  const pluginJsonDest = join(claudeOutputDir, '.claude-plugin', 'plugin.json');
  if (existsSync(pluginJsonSrc)) {
    mkdirSync(dirname(pluginJsonDest), { recursive: true });
    cpSync(pluginJsonSrc, pluginJsonDest);
    console.log('  Copied .claude-plugin/plugin.json');
  }

  // Copy .mcp.json
  const mcpJsonSrc = join(claudeConfigDir, '.mcp.json');
  const mcpJsonDest = join(claudeOutputDir, '.mcp.json');
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
    config.writeAgent(destPath, content, meta);
  }

  console.log(`  Processed ${files.length} agent(s) → ${config.agentsDir}/`);
}

/**
 * Process commands folder
 */
function processCommands(agentName, config) {
  const srcDir = join(artifactsDir, 'commands');
  if (!existsSync(srcDir)) {
    console.log(`  Skipped commands/ (source does not exist)`);
    return;
  }

  const destDir = join(config.outputDir, config.commandsDir);
  mkdirSync(destDir, { recursive: true });

  const files = readdirSync(srcDir).filter(
    (f) => f.endsWith('.md') && !f.endsWith('.meta.json')
  );
  for (const file of files) {
    const srcPath = join(srcDir, file);
    const baseName = basename(file, '.md');
    const destPath = join(destDir, baseName + config.commandsExt);

    const { content, meta } = readArtifact(srcPath);
    validateCommandMeta(meta, srcPath);
    config.writeCommand(destPath, content, meta, config);
  }

  console.log(
    `  Processed ${files.length} command(s) → ${config.commandsDir}/`
  );
}

/**
 * Process skills folder
 */
function processSkills(agentName, config) {
  const srcDir = join(artifactsDir, 'skills');
  if (!existsSync(srcDir)) {
    console.log(`  Skipped skills/ (source does not exist)`);
    return;
  }

  const destDir = join(config.outputDir, config.skillsDir);

  // Skills are in subdirectories: skills/skill-name/SKILL.md
  const skillDirs = readdirSync(srcDir).filter((d) =>
    statSync(join(srcDir, d)).isDirectory()
  );

  for (const skillDir of skillDirs) {
    const srcSkillFile = join(srcDir, skillDir, 'SKILL.md');
    if (!existsSync(srcSkillFile)) continue;

    const destSkillDir = join(destDir, skillDir);
    mkdirSync(destSkillDir, { recursive: true });

    const destSkillFile = join(destSkillDir, config.skillsFile);
    const { content, meta } = readArtifact(srcSkillFile);
    config.writeSkill(destSkillFile, content, meta);
  }

  console.log(
    `  Processed ${skillDirs.length} skill(s) → ${config.skillsDir}/`
  );
}

// ============== Main Execution ==============

const isCheckMode = process.argv.includes('--check');

function runSync() {
  console.log('Syncing artifacts to generated/ folders...\n');

  // Clear and recreate generated directory
  recreateDir(generatedDir);

  // Process each agent
  for (const [agentName, config] of Object.entries(agents)) {
    console.log(`\n[${agentName}] → ${config.outputDir.replace(rootDir, '.')}`);

    mkdirSync(config.outputDir, { recursive: true });

    processAgents(agentName, config);
    processCommands(agentName, config);
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
  const gitDiff = execSync('git diff --name-only generated/', {
    encoding: 'utf-8',
  }).trim();

  if (gitDiff) {
    console.error(
      '\nError: Generated files in generated/ are out of sync with source.'
    );
    console.error(
      "Please run 'npx nx sync-artifacts' and stage the changes.\n"
    );
    console.error('Changed files:');
    console.error(gitDiff);
    console.error('\nDiff:');
    const diff = execSync('git diff generated/', { encoding: 'utf-8' });
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

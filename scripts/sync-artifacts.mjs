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
import { Liquid } from 'liquidjs';
import ejs from 'ejs';

const rootDir = join(import.meta.dirname, '..');
const artifactsDir = join(rootDir, 'artifacts');
const generatedDir = join(rootDir, 'generated');

// Bump this when the workspace-context schema changes incompatibly. See templates/README.md.
const TEMPLATES_SCHEMA_VERSION = 'v1';
const templatesDir = join(rootDir, 'templates', TEMPLATES_SCHEMA_VERSION);

/**
 * The context `generated/` is rendered with. Every workspace fact is absent, because at
 * build time we genuinely do not know any of them. Templates branch on this, so the
 * absent case renders the "go determine it yourself" prose that agents relied on before
 * workspace-aware rendering existed.
 */
const DEFAULT_WORKSPACE_CONTEXT = { pm: null };

// Agent output configurations for the main nx plugin
function createPlatformConfigs(outputDir, genDir, preserveTokens = false) {
  const configs = {
    claude: {
      outputDir: outputDir,
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
      outputDir: join(genDir, '.opencode'),
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
      outputDir: join(genDir, '.github'),
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
      outputDir: join(genDir, '.cursor'),
      skillsOutputDir: join(genDir, '.agents'), // Share .agents/skills with Codex
      agentsDir: 'agents',
      agentsExt: '.md',
      commandsDir: null, // Skills are automatically commands in Cursor
      commandsExt: null,
      skillsDir: 'skills',
      skillsFile: 'SKILL.md',
      supportsAgents: true,
      argumentsPlaceholder: null, // strip entirely
      writeAgent: writeCursorAgent,
      writeCommand: null,
      writeSkill: writeBasicSkill,
    },
    gemini: {
      outputDir: join(genDir, '.gemini'),
      skillsOutputDir: join(genDir, '.agents'), // Share .agents/skills with Codex
      agentsDir: null, // Gemini doesn't support agents
      agentsExt: null,
      commandsDir: 'commands',
      commandsExt: '.toml',
      skillsDir: 'skills',
      skillsFile: 'SKILL.md',
      supportsAgents: false,
      argumentsPlaceholder: '{{args}}',
      writeAgent: null,
      writeCommand: writeGeminiCommand,
      writeSkill: writeBasicSkill,
    },
    codex: {
      outputDir: join(genDir, '.agents'),
      agentsOutputDir: join(genDir, '.codex'), // Agent TOML files go to .codex/agents/
      agentsDir: 'agents',
      agentsExt: '.toml',
      commandsDir: null, // No separate commands concept
      commandsExt: null,
      skillsDir: 'skills',
      skillsFile: 'SKILL.md',
      supportsAgents: true,
      argumentsPlaceholder: '$ARGUMENTS',
      writeAgent: writeCodexAgent,
      writeCommand: null,
      writeSkill: writeBasicSkill,
    },
  };

  for (const config of Object.values(configs)) {
    config.preserveTokens = preserveTokens;
  }
  return configs;
}

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
 * Write Codex agent (TOML config file with developer_instructions)
 */
function writeCodexAgent(destPath, content, meta) {
  const tomlObj = {
    developer_instructions: content.trim(),
  };

  let tomlOutput = TOML.stringify(tomlObj);
  tomlOutput = toMultilineTomlString(tomlOutput, 'developer_instructions');
  writeFileSync(destPath, tomlOutput);
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

// ============== Content Transformation ==============

const liquid = new Liquid();

/**
 * Transform skill content for agent-specific output.
 * Uses LiquidJS templating to render platform-specific content.
 *
 * Source content uses Liquid conditionals:
 *   {%- if platform == "claude" %}...{%- else %}...{%- endif %}
 *
 * @param {string} content - The raw skill/agent content (Liquid template)
 * @param {object} config - Platform config from createPlatformConfigs
 */
export function transformContent(content, platformKey, preserveTokens = false) {
  if (!platformKey) {
    throw new Error('transformContent: platformKey is required');
  }

  let result;
  try {
    result = liquid.parseAndRenderSync(content, {
      platform: platformKey,
    });
  } catch (err) {
    throw new Error(
      `Liquid template error (platform: ${platformKey}): ${err.message}`
    );
  }

  result = renderWorkspaceTokens(result, preserveTokens, platformKey);

  if (platformKey !== 'claude') {
    result = result.replace(/Claude Code/g, 'AI agent');
  }
  result = result.replace(/\n{3,}/g, '\n\n');
  return result;
}

/**
 * Resolve the EJS workspace-context tokens (`<%= pm.nx %>`, `<% if (pm) %>`, …).
 *
 * Liquid owns `{{ }}`/`{% %}` and EJS owns `<% %>`, so the tokens ride through the
 * platform render above untouched and are settled here.
 *
 * - `templates/`: left intact, so `nx configure-ai-agents` can render them against the
 *   real workspace.
 * - `generated/`: rendered against the empty context, producing self-contained markdown
 *   with no EJS left in it. This matters — released versions of nx run every file they
 *   copy through `ejs.render(content, {})`, and a surviving `<%= pm.nx %>` would throw
 *   `ReferenceError` and break `configure-ai-agents` for them.
 */
export function renderWorkspaceTokens(content, preserveTokens, platformKey) {
  if (preserveTokens) {
    return content;
  }
  try {
    return ejs.render(content, DEFAULT_WORKSPACE_CONTEXT);
  } catch (err) {
    throw new Error(
      `Workspace-context template error (platform: ${platformKey}): ${err.message}\n` +
        `Templates must render against the empty context — guard every workspace fact ` +
        `with '<% if (pm) { %>' so generated/ keeps a usable fallback.`
    );
  }
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
 * Clean Claude plugin output before regenerating.
 * Removes generated dirs/files but preserves marketplace.json and plugin.json.
 */
function cleanClaudeOutput(outputDir) {
  for (const dir of ['skills', 'agents', 'hooks']) {
    const p = join(outputDir, dir);
    if (existsSync(p)) rmSync(p, { recursive: true });
  }
  const mcpJson = join(outputDir, '.mcp.json');
  if (existsSync(mcpJson)) rmSync(mcpJson);
}

/**
 * Write the explainer that sits above the versioned template directories.
 */
function writeTemplatesReadme() {
  const readme = `# Workspace-context templates

<!-- Generated by scripts/sync-artifacts.mjs. Edit that script, not this file. -->

These are the same skills as \`generated/\`, but with the workspace-context tokens left
unresolved. \`nx configure-ai-agents\` clones this repo and renders them against the
workspace it is running in, so a skill can *state* a fact — "run \\\`yarn nx build\\\`" —
instead of telling the agent to go work it out from the lockfile.

\`\`\`
artifacts/                      the source
    │
    ├── sync ──►  templates/${TEMPLATES_SCHEMA_VERSION}/    tokens intact    → rendered by nx, per workspace
    └── sync ──►  generated/     tokens resolved  → copied as-is by older nx
\`\`\`

\`generated/\` is not a separate copy that can drift: it is these same templates rendered
against the empty context. Where a template asks "do we know the package manager?", the
answer there is no, so it renders the same "check the lockfile" guidance the skills
carried before any of this existed. Both outputs are correct; one of them just knows more.

## Why the directory is versioned

\`nx\` clones this repository at **unpinned HEAD** — every released nx version, forever,
gets whatever is on the default branch right now. There is no version negotiation and no
lockfile.

That makes the context schema a **public API with an unusually cruel contract**: the
moment a template here references a token that the *installed* nx does not pass, EJS
throws \`ReferenceError\`, and \`nx configure-ai-agents\` breaks — not for users who upgrade,
but for users who already installed some older version and never touch it again.

The version in the path is what makes that survivable:

- \`nx\` asks for the schema version it knows how to populate (\`templates/${TEMPLATES_SCHEMA_VERSION}\`).
- Adding a **new** fact to the context is backwards-compatible — guard it (see below) and
  older nx simply renders the fallback branch.
- **Removing or reshaping** an existing fact is not. Add \`templates/v2\` instead and leave
  \`${TEMPLATES_SCHEMA_VERSION}\` alone. Old nx keeps reading \`${TEMPLATES_SCHEMA_VERSION}\` forever; that is the entire point.
- If nx asks for a version this repo does not have, it falls back to \`generated/\` and the
  user gets the generic-but-correct skills. Degraded, never broken.

## Writing a template

Guard **every** workspace fact. The context is genuinely empty when \`generated/\` is built,
and it is genuinely empty for any nx too old to know about the fact you just added:

\`\`\`markdown
<% if (pm) { %>
This workspace uses <%= pm.name %>. Run nx with \\\`<%= pm.nx %>\\\`.
<% } else { %>
Check the lockfile to determine the package manager, and prefix nx commands with it.
<% } %>
\`\`\`

An unguarded \`<%= pm.name %>\` fails the build, by design — \`sync-artifacts\` renders every
template against the empty context precisely so this cannot reach a user.

Note the two template languages do not collide: Liquid (\`{% ... %}\`, \`{{ ... }}\`) is
resolved at build time for platform differences, EJS (\`<% ... %>\`) is resolved later by
nx for workspace facts.

## Schema ${TEMPLATES_SCHEMA_VERSION}

| Token | Type | Meaning |
| --- | --- | --- |
| \`pm\` | object \\| null | \`null\` when the package manager is unknown |
| \`pm.name\` | \`'npm' \\| 'yarn' \\| 'pnpm' \\| 'bun'\` | detected package manager |
| \`pm.nx\` | string | how to invoke nx here, e.g. \`npm exec nx\` |
| \`pm.exec\` | string | run a local binary, e.g. \`npx\` |
| \`pm.dlx\` | string | run a package without installing, e.g. \`npx -y\` |
| \`pm.add\` | string | add a dependency |
| \`pm.addDev\` | string | add a dev dependency |
| \`pm.install\` | string | install dependencies |
| \`pm.workspaceGlobFile\` | string | where workspace globs live, e.g. \`pnpm-workspace.yaml\` |
| \`pm.supportsWorkspaceProtocol\` | boolean | whether \`workspace:*\` is supported |

Only add a fact here if it is something the skills currently tell the agent to go and
determine, *and* nx already knows it at generation time. Anything else belongs in the
skill prose.
`;

  const readmePath = join(rootDir, 'templates', 'README.md');
  mkdirSync(dirname(readmePath), { recursive: true });
  writeFileSync(readmePath, readme);
  console.log('  Wrote templates/README.md');
}

/**
 * Copy Claude plugin config files (e.g. .mcp.json, .claude-plugin/) to output dir
 */
function copyClaudePluginConfigs(srcArtifactsDir, outputDir) {
  const claudeConfigDir = join(srcArtifactsDir, 'claude-config');

  // Copy .mcp.json
  const mcpJsonSrc = join(claudeConfigDir, '.mcp.json');
  const mcpJsonDest = join(outputDir, '.mcp.json');
  if (existsSync(mcpJsonSrc)) {
    cpSync(mcpJsonSrc, mcpJsonDest);
    console.log('  Copied .mcp.json');
  }

  // Copy .claude-plugin/ directory (e.g. plugin.json for sub-plugins)
  const claudePluginSrc = join(claudeConfigDir, '.claude-plugin');
  const claudePluginDest = join(outputDir, '.claude-plugin');
  if (existsSync(claudePluginSrc)) {
    cpSync(claudePluginSrc, claudePluginDest, { recursive: true });
    console.log('  Copied .claude-plugin/');
  }

  // Copy hooks/ directory (convention-based hook discovery)
  const hooksSrc = join(claudeConfigDir, 'hooks');
  const hooksDest = join(outputDir, 'hooks');
  if (existsSync(hooksSrc)) {
    cpSync(hooksSrc, hooksDest, { recursive: true });
    console.log('  Copied hooks/');
  }
}

/**
 * Process agents folder from a given source directory
 */
function processAgents(agentName, config, srcArtifactsDir) {
  if (!config.supportsAgents) {
    return;
  }

  const srcDir = join(srcArtifactsDir, 'agents');
  if (!existsSync(srcDir)) {
    console.log(`  Skipped agents/ (source does not exist)`);
    return;
  }

  const baseDir = config.agentsOutputDir || config.outputDir;
  const destDir = join(baseDir, config.agentsDir);
  mkdirSync(destDir, { recursive: true });

  const files = readdirSync(srcDir).filter(
    (f) => f.endsWith('.md') && !f.endsWith('.meta.json')
  );
  for (const file of files) {
    const srcPath = join(srcDir, file);
    const baseName = basename(file, '.md');
    const destPath = join(destDir, baseName + config.agentsExt);

    const { content: rawContent, meta } = readArtifact(srcPath);
    validateAgentMeta(meta, srcPath);
    const content = transformContent(
      rawContent,
      agentName,
      config.preserveTokens
    );
    config.writeAgent(destPath, content, meta);
  }

  console.log(`  Processed ${files.length} agent(s) → ${config.agentsDir}/`);
}

/**
 * Process skills folder from a given source directory
 * For Claude: command skills go to skills/ with user-invocable: true
 * For other agents: command skills go to commands/ folder
 */
/**
 * Copy a skill's supplementary directory (references/, scripts/, assets/), rendering the
 * markdown in it the same way SKILL.md is rendered.
 *
 * These used to be copied byte-for-byte, which meant a reference could only ever describe
 * how to *determine* a workspace fact — it had no way to state one. Rendering them lets a
 * reference answer the question directly when the answer is known.
 */
function copySkillExtras(srcDir, destDir, agentName, config) {
  mkdirSync(destDir, { recursive: true });

  for (const entry of readdirSync(srcDir)) {
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);

    if (statSync(srcPath).isDirectory()) {
      copySkillExtras(srcPath, destPath, agentName, config);
    } else if (entry.endsWith('.md')) {
      const rendered = transformContent(
        readFileSync(srcPath, 'utf-8'),
        agentName,
        config.preserveTokens
      );
      writeFileSync(destPath, rendered);
    } else {
      cpSync(srcPath, destPath);
    }
  }
}

function processSkills(agentName, config, srcArtifactsDir) {
  const srcDir = join(srcArtifactsDir, 'skills');
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

    const { content: rawContent, meta } = readArtifact(srcSkillFile);
    validateSkillMeta(meta, srcSkillFile);
    const content = transformContent(
      rawContent,
      agentName,
      config.preserveTokens
    );

    // Always write as skill
    const skillBaseDir = config.skillsOutputDir || config.outputDir;
    const destDir = join(skillBaseDir, config.skillsDir);
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
        copySkillExtras(srcPath, join(destSkillDir, entry), agentName, config);
      }
    }

    // For non-Claude agents, also write command skills to commands folder
    if (meta.command && agentName !== 'claude' && config.commandsDir) {
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

/**
 * Generate Codex config.toml with MCP servers, agent definitions, and feature flags.
 * Uses marker comments so downstream tools (e.g. configure-ai-agents in nx) can
 * identify and replace the nx-managed section when merging into user config files.
 */
function writeCodexConfig(srcArtifactsDir, genDir) {
  const mcpJsonPath = join(srcArtifactsDir, 'claude-config', '.mcp.json');
  if (!existsSync(mcpJsonPath)) {
    console.log('  Skipped .codex/config.toml (no .mcp.json source)');
    return;
  }

  const mcpJson = JSON.parse(readFileSync(mcpJsonPath, 'utf-8'));

  // Build MCP servers object
  const mcpServers = {};
  for (const [name, server] of Object.entries(mcpJson)) {
    const entry = {};
    if (server.command) entry.command = server.command;
    if (server.args) entry.args = server.args;
    if (server.env) entry.env = server.env;
    // Skip 'type' — Codex infers it
    mcpServers[name] = entry;
  }

  // Collect generated agent TOML files to reference in config
  const codexAgentsDir = join(genDir, '.codex', 'agents');
  const agentEntries = {};
  if (existsSync(codexAgentsDir)) {
    const agentFiles = readdirSync(codexAgentsDir).filter((f) =>
      f.endsWith('.toml')
    );
    for (const file of agentFiles) {
      const baseName = basename(file, '.toml');
      // Read the corresponding source metadata for description
      const srcMetaPath = join(
        srcArtifactsDir,
        'agents',
        baseName + '.md.meta.json'
      );
      if (existsSync(srcMetaPath)) {
        const meta = JSON.parse(readFileSync(srcMetaPath, 'utf-8'));
        agentEntries[baseName] = {
          description: meta.description,
          config_file: `agents/${file}`,
        };
      }
    }
  }

  const hasAgents = Object.keys(agentEntries).length > 0;

  const parts = [];
  parts.push(TOML.stringify({ mcp_servers: mcpServers }).trim());

  if (hasAgents) {
    parts.push('');
    parts.push(TOML.stringify({ features: { multi_agent: true } }).trim());
    parts.push('');
    parts.push(TOML.stringify({ agents: agentEntries }).trim());
  }

  parts.push('');

  const codexDir = join(genDir, '.codex');
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(join(codexDir, 'config.toml'), parts.join('\n'));
  console.log('  Generated .codex/config.toml');
}

/**
 * Process a single artifact set: generate outputs for all agent platforms from a source dir
 */
function processArtifacts(name, srcArtifactsDir, agentConfigs) {
  for (const [agentName, config] of Object.entries(agentConfigs)) {
    console.log(
      `\n[${name}:${agentName}] → ${config.outputDir.replace(rootDir, '.')}`
    );

    mkdirSync(config.outputDir, { recursive: true });

    processAgents(agentName, config, srcArtifactsDir);
    processSkills(agentName, config, srcArtifactsDir);
  }
}

// ============== Main Execution ==============

const isCheckMode = process.argv.includes('--check');

function runSync() {
  console.log('Syncing artifacts...\n');

  // Clean main Claude output at repo root (preserves marketplace.json)
  cleanClaudeOutput(rootDir);

  // Clear and recreate generated directory
  recreateDir(generatedDir);

  // ---- Main nx artifacts ----
  const mainConfigs = createPlatformConfigs(rootDir, generatedDir);
  processArtifacts('nx', artifactsDir, mainConfigs);

  console.log('\n[nx:claude] Copying plugin config files...');
  copyClaudePluginConfigs(artifactsDir, rootDir);

  console.log('\n[nx:codex] Generating config...');
  writeCodexConfig(artifactsDir, generatedDir);

  // ---- Workspace-context templates ----
  // Same sources, same platform rendering — but the workspace tokens are left unresolved
  // so `nx configure-ai-agents` can settle them against the real workspace. Claude is
  // skipped: its skills reach users through the plugin marketplace rather than being
  // copied by the generator, so nothing would ever render them.
  console.log(`\n[nx:templates] → ./templates/${TEMPLATES_SCHEMA_VERSION}`);
  recreateDir(templatesDir);
  const templateConfigs = createPlatformConfigs(
    join(templatesDir, '.claude'),
    templatesDir,
    true
  );
  delete templateConfigs.claude;
  processArtifacts('nx-templates', artifactsDir, templateConfigs);
  writeTemplatesReadme();

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
    'git diff --name-only generated/ templates/ skills/ agents/ .mcp.json',
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
      'git diff generated/ templates/ skills/ agents/ .mcp.json',
      {
        encoding: 'utf-8',
      }
    );
    if (diff) console.error(diff);
    process.exit(1);
  }

  console.log('\nAll generated artifacts are up to date!');
}

// Run appropriate mode (only when executed directly, not when imported)
const isMainModule =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMainModule) {
  if (isCheckMode) {
    runCheck();
  } else {
    runSync();
  }
}

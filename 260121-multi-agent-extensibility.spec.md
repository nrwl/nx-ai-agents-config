---
source: ../nx-3/260120-configure-ai-agents-extensibility.spec.md
created: 2026-01-21
status: complete

state:
  phase: review
  scope: narrow

  codebase_context:
    - reference: "Claude plugin structure"
      location: "nx-claude-plugin/"
      summary: "Published plugin directory with agents/, commands/, skills/ subdirs. Contains nx-ci-monitor agent/command and nx-generate skill."
    - reference: "Source artifacts"
      location: "artifacts/"
      summary: "Source of truth for plugin content - markdown files that get copied to nx-claude-plugin/ via build script"
    - reference: "Build script"
      location: "scripts/build-claude-plugin.mjs"
      summary: "Copies artifacts/ to nx-claude-plugin/ (fresh copy, removes existing first)"
    - reference: "Marketplace config"
      location: ".claude-plugin/marketplace.json"
      summary: "Registers 'nx' plugin (v0.2.0) pointing to ./nx-claude-plugin"
    - reference: "nx-plugins documentation"
      location: "nx-plugins/"
      summary: "Plugin docs for cypress, jest, playwright, vitest - NOT part of Claude plugin"

  question_queue: []

  answered_questions:
    - id: q1
      topic: generated_folder
      question: "Should we create a new generated/ folder for non-Claude agents, or repurpose/rename existing directories?"
      answer: "Yes, create generated/ folder. Include Claude plugin there too to align everything. Marketplace will point to new location."
      spawned: [q5]
    - id: q2
      topic: source_artifacts
      question: "Will the existing artifacts/ folder serve as the source for ALL agents, or will different agents need different source formats?"
      answer: "Skills are same format regardless of agent. Subagents need transformation to multiple formats. Single source in artifacts/."
      spawned: []
    - id: q3
      topic: transformation
      question: "What transformation is needed from the current Claude-format artifacts to other agent formats?"
      answer: "Mostly cosmetic transformations, no big content restructures. Research confirmed: file extensions, tools format, and frontmatter fields differ."
      spawned: [q6, q7]
    - id: q4
      topic: build_process
      question: "Should there be a single build script that outputs to all agent folders, or separate scripts per agent?"
      answer: "Single script to run syncing/building. Claude is just one of many targets."
      spawned: []
    - id: q5
      topic: claude_plugin_location
      question: "Where exactly should the Claude plugin live within generated/? As generated/.claude-plugin/ or generated/.claude/?"
      answer: "Use generated/nx-claude-plugin to keep current naming."
      spawned: []
    - id: q6
      topic: tool_mapping
      question: "How should Claude tool names map to other agents? (e.g., Claude's 'Read' → OpenCode's 'read' → Copilot's 'read')"
      answer: "Minimize tool definitions in artifacts. Where necessary, track in metadata and transform with mapping table."
      spawned: []
    - id: q7
      topic: commands_format
      question: "Commands seem to vary by agent (prompts vs commands, .md vs .toml). Should we research these formats too?"
      answer: "Yes, researched. Key findings: Gemini uses TOML, Copilot uses .prompt.md extension, Cursor is plain MD, others use MD+YAML. Codex is user-local only."
      spawned: [q8, q9, q10]
    - id: q8
      topic: codex_limitation
      question: "Codex only supports user-local prompts (~/.codex/prompts/), not project-level. Should we still generate for it?"
      answer: "Skip Codex commands/skills generation. Codex gets MCP config via .codex/config.toml (analogous to current approach). No project-level prompts supported."
      spawned: []
    - id: q9
      topic: build_script_tech
      question: "What technology for the build script? Keep Node.js/mjs or switch to something else?"
      answer: "Keep Node.js, extend existing script, rename it."
      spawned: []
    - id: q10
      topic: placeholder_transformation
      question: "Should we transform argument placeholders ($ARGUMENTS → {{args}} for Gemini) or keep commands simple without arguments?"
      answer: "Keep commands simple for now, but set up architecture to allow arg transformation later."
      spawned: [q11]
    - id: q11
      topic: arg_limitation
      question: "The nx-ci-monitor command uses $ARGUMENTS heavily. Accept loss of configurability on other agents for now?"
      answer: "Yes, accept limitation for now. Commands will work but won't be configurable on non-Claude agents until arg transformation is added."
      spawned: [q12, q13, q14, q15]
    - id: q12
      topic: script_naming
      question: "What should we rename build-claude-plugin.mjs to?"
      answer: "sync-artifacts.mjs"
      spawned: []
    - id: q13
      topic: skills_verification
      question: "Skills seem universal with only directory/filename differences. Correct?"
      answer: "Yes, correct. Only differences are directory naming (skills/ vs skill/) and file casing (SKILL.md vs skill.md for Gemini)."
      spawned: []
    - id: q14
      topic: marketplace_update
      question: "Should build script update marketplace.json to point to generated/nx-claude-plugin?"
      answer: "No, update manually once."
      spawned: []
    - id: q15
      topic: ci_integration
      question: "Should build script run in CI to keep generated/ in sync, or manual step?"
      answer: "Manual step before committing. CI runs a check on PR (like current verify script) but doesn't auto-generate."
      spawned: []

  key_decisions:
    - "Files do NOT need nx- prefix (requirement scrapped per user)"
    - "Claude plugin at generated/nx-claude-plugin (marketplace points to new location)"
    - "Single source of truth in artifacts/, transformed per agent"
    - "Rename build script to sync-artifacts.mjs"
    - "Skills format is universal - only directory/filename differences (skills/ vs skill/, SKILL.md vs skill.md)"
    - "Agents/subagents need format transformation (tools syntax, file extensions)"
    - "Commands need format transformation: Gemini=TOML, Copilot=.prompt.md, Cursor=plain MD"
    - "Minimize tool definitions; use metadata + mapping table where needed"
    - "Codex: MCP config only via .codex/config.toml - no project-level commands/skills (not supported)"
    - "Keep commands simple (no args) for now - accept loss of configurability on non-Claude agents"
    - "Marketplace.json updated manually once to point to generated/nx-claude-plugin"
    - "Manual build step before committing; CI runs verification check on PR"

  open_threads: []

  splits_identified: []

  coherence_check:
    sufficient_for_spec: true
    blocking_gaps: []
---

## Spec Content

### Overview

Extend the nx-ai-agents-config repository to generate extensibility artifacts (commands, skills, subagents) for multiple AI agents beyond Claude. The Nx CLI will clone this repo and copy files from `generated/` folders directly to user workspaces.

### Current State

The repo currently:
- Has `artifacts/` as source of truth (markdown files)
- Builds to `nx-claude-plugin/` via `scripts/build-claude-plugin.mjs`
- Publishes Claude plugin via `.claude-plugin/marketplace.json`

### Target Agents

Per the Nx spec, need to generate for:
| Agent | Commands | Skills | Subagents | Format Location |
|-------|----------|--------|-----------|-----------------|
| Claude | Yes | Yes | Yes | `generated/nx-claude-plugin/` |
| OpenCode | Yes | Yes | Yes | `generated/.opencode/` |
| Copilot | Yes | Yes | Yes | `generated/.github/` |
| Cursor | Yes | Yes | No | `generated/.cursor/` |
| Codex | No* | No* | No | MCP config only |
| Gemini | Yes | Yes | No | `generated/.gemini/` |

*Codex only supports user-local prompts (`~/.codex/prompts/`), not project-level. Nx configures Codex via `.codex/config.toml` for MCP only.

### Required Structure

```
generated/
├── nx-claude-plugin/         # Claude plugin (marketplace points here)
│   ├── .claude-plugin/plugin.json
│   ├── .mcp.json
│   ├── agents/*.md
│   ├── commands/*.md
│   └── skills/*/SKILL.md
├── .opencode/
│   ├── agents/*.md
│   ├── commands/*.md
│   └── skills/*/SKILL.md
├── .github/
│   ├── agents/*.agent.md
│   ├── prompts/*.prompt.md
│   └── skills/*/SKILL.md
├── .cursor/
│   ├── commands/*.md
│   └── skills/*/SKILL.md
└── .gemini/
    ├── commands/*.toml
    └── skills/*/skill.md

# Note: Codex not included - only supports user-local prompts, not project-level
```

### Agent/Subagent Format Differences (Research Findings)

| Aspect | Claude | OpenCode | GitHub Copilot |
|--------|--------|----------|----------------|
| **Directory** | `agents/` | `agents/` | `agents/` |
| **Extension** | `.md` | `.md` | `.agent.md` |
| **Required Fields** | `name`, `description` | `description` only | `description` only |
| **Tools Format** | Comma-separated | Boolean object | String list |

**Tools syntax transformation needed:**
```yaml
# Claude (source)
tools: Read, Grep, Glob, Bash

# OpenCode (target)
tools:
  read: true
  grep: true
  glob: true
  bash: true

# Copilot (target)
tools: ["read", "grep", "glob", "bash"]
```

### Command/Prompt Format Differences (Research Findings)

| Feature | Claude | OpenCode | Copilot | Cursor | Codex | Gemini |
|---------|--------|----------|---------|--------|-------|--------|
| **Format** | MD+YAML | MD+YAML | MD+YAML | Plain MD | MD+YAML | **TOML** |
| **Extension** | `.md` | `.md` | `.prompt.md` | `.md` | `.md` | `.toml` |
| **Directory** | `commands/` | `commands/` | `prompts/` | `commands/` | `prompts/` | `commands/` |
| **Arguments** | `$ARGUMENTS` | `$ARGUMENTS` | `${input:name}` | appended | `$ARGUMENTS` | `{{args}}` |
| **Project-level** | Yes | Yes | Yes | Yes | **No** (user-local only) | Yes |

**Gemini TOML conversion example:**
```toml
# Source (Claude markdown)
# ---
# description: Generate code using Nx generators
# ---
# Help me generate code...

# Target (Gemini TOML)
description = "Generate code using Nx generators"
prompt = """
Help me generate code...
"""
```

---

## Implementation Plan

### Phase 1: Restructure and Rename

1. **Create `generated/` directory structure**
   ```
   mkdir -p generated/nx-claude-plugin
   mkdir -p generated/.opencode/{agents,commands,skills}
   mkdir -p generated/.github/{agents,prompts,skills}
   mkdir -p generated/.cursor/{commands,skills}
   mkdir -p generated/.gemini/{commands,skills}
   ```

2. **Rename build script**
   - `scripts/build-claude-plugin.mjs` → `scripts/sync-artifacts.mjs`
   - Update `package.json` target name accordingly

3. **Update marketplace.json manually**
   - Change source path from `./nx-claude-plugin` to `./generated/nx-claude-plugin`

4. **Move existing nx-claude-plugin content**
   - Delete `nx-claude-plugin/` after first successful build to `generated/`

### Phase 2: Extend Build Script

The `sync-artifacts.mjs` script should:

1. **Clear and recreate `generated/` directories** (fresh build each time)

2. **Process each artifact type:**

   **For Skills** (universal format, minor adjustments):
   ```javascript
   // Claude: skills/*/SKILL.md → generated/nx-claude-plugin/skills/*/SKILL.md
   // OpenCode: skills/*/SKILL.md → generated/.opencode/skills/*/SKILL.md
   // Copilot: skills/*/SKILL.md → generated/.github/skills/*/SKILL.md
   // Cursor: skills/*/SKILL.md → generated/.cursor/skills/*/SKILL.md
   // Gemini: skills/*/SKILL.md → generated/.gemini/skills/*/skill.md (lowercase)
   ```

   **For Commands** (format transformation needed):
   ```javascript
   // Claude: commands/*.md → generated/nx-claude-plugin/commands/*.md (copy)
   // OpenCode: commands/*.md → generated/.opencode/commands/*.md (copy)
   // Copilot: commands/*.md → generated/.github/prompts/*.prompt.md (rename ext)
   // Cursor: commands/*.md → generated/.cursor/commands/*.md (strip frontmatter)
   // Gemini: commands/*.md → generated/.gemini/commands/*.toml (convert to TOML)
   ```

   **For Agents** (format transformation needed):
   ```javascript
   // Claude: agents/*.md → generated/nx-claude-plugin/agents/*.md (copy)
   // OpenCode: agents/*.md → generated/.opencode/agents/*.md (transform tools)
   // Copilot: agents/*.md → generated/.github/agents/*.agent.md (transform tools, rename)
   ```

3. **Copy Claude plugin config files:**
   - `.claude-plugin/plugin.json` → `generated/nx-claude-plugin/.claude-plugin/plugin.json`
   - `.mcp.json` → `generated/nx-claude-plugin/.mcp.json`

### Phase 3: Transformation Functions

Create modular transformation functions for future extensibility:

```javascript
// Transform Claude tools format to target format
function transformTools(toolsString, targetAgent) {
  // For now, minimize tool definitions
  // Future: implement mapping table
  if (targetAgent === 'opencode') {
    // Convert "Read, Grep" → { read: true, grep: true }
  } else if (targetAgent === 'copilot') {
    // Convert "Read, Grep" → ["read", "grep"]
  }
}

// Convert markdown+YAML to TOML (for Gemini)
function markdownToToml(content) {
  const { frontmatter, body } = parseFrontmatter(content);
  return `description = "${frontmatter.description}"\nprompt = """\n${body}\n"""`;
}

// Strip frontmatter (for Cursor)
function stripFrontmatter(content) {
  return content.replace(/^---[\s\S]*?---\n*/, '');
}
```

### Phase 4: Update Verification Script

Update `scripts/verify-plugin-build.sh` to:
- Check all `generated/` subdirectories exist
- Verify file counts match between artifacts/ and generated/
- Validate TOML syntax for Gemini commands

### Files to Modify

| File | Change |
|------|--------|
| `scripts/build-claude-plugin.mjs` | Rename to `sync-artifacts.mjs`, extend with multi-agent support |
| `scripts/verify-plugin-build.sh` | Update to verify all generated/ folders |
| `package.json` | Update target name from `build-claude-plugin` to `sync-artifacts` |
| `.claude-plugin/marketplace.json` | Update source path (manual, one-time) |
| `nx-claude-plugin/` | Delete after migration (replaced by generated/nx-claude-plugin/) |
| `CLAUDE.md` | Update build instructions |

### Known Limitations (v1)

- **Arguments not transformed**: Commands using `$ARGUMENTS` will lose configurability on non-Claude agents
- **Tool definitions minimal**: Avoiding tool restrictions in agents to keep transformations simple
- **No Codex support**: Codex doesn't support project-level prompts/skills

### Future Enhancements

- Argument placeholder transformation (`$ARGUMENTS` → `{{args}}` etc.)
- Tool mapping table for agent-specific tool names
- Validation of generated files against agent schemas

---

## Appendix: Interview State

The YAML frontmatter above contains the complete interview history including all questions asked, answers given, and decisions made during the spec development process.

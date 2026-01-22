#!/bin/bash
set -e

echo "Running sync-artifacts..."
node scripts/sync-artifacts.mjs

echo ""
echo "Checking for uncommitted changes..."
if [ -n "$(git status --porcelain generated/)" ]; then
  echo "Error: Generated files in generated/ are out of sync with source."
  echo "Please run 'node scripts/sync-artifacts.mjs' and commit the changes."
  echo ""
  echo "Changed files:"
  git status --porcelain generated/
  echo ""
  echo "Diff:"
  git diff generated/
  exit 1
fi

echo ""
echo "Verifying generated directory structure..."

# Check Claude plugin
if [ ! -d "generated/nx-claude-plugin" ]; then
  echo "Error: generated/nx-claude-plugin/ does not exist"
  exit 1
fi

if [ ! -f "generated/nx-claude-plugin/.claude-plugin/plugin.json" ]; then
  echo "Error: generated/nx-claude-plugin/.claude-plugin/plugin.json does not exist"
  exit 1
fi

if [ ! -f "generated/nx-claude-plugin/.mcp.json" ]; then
  echo "Error: generated/nx-claude-plugin/.mcp.json does not exist"
  exit 1
fi

# Check OpenCode
if [ ! -d "generated/.opencode" ]; then
  echo "Error: generated/.opencode/ does not exist"
  exit 1
fi

# Check Copilot (GitHub)
if [ ! -d "generated/.github" ]; then
  echo "Error: generated/.github/ does not exist"
  exit 1
fi

# Check Cursor
if [ ! -d "generated/.cursor" ]; then
  echo "Error: generated/.cursor/ does not exist"
  exit 1
fi

# Check Gemini
if [ ! -d "generated/.gemini" ]; then
  echo "Error: generated/.gemini/ does not exist"
  exit 1
fi

# Verify file counts match between artifacts and generated
echo ""
echo "Verifying file counts..."

# Count source files
AGENTS_COUNT=$(find artifacts/agents -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
COMMANDS_COUNT=$(find artifacts/commands -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
SKILLS_COUNT=$(find artifacts/skills -type d -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')

echo "Source counts: agents=$AGENTS_COUNT, commands=$COMMANDS_COUNT, skills=$SKILLS_COUNT"

# Verify Claude
CLAUDE_AGENTS=$(find generated/nx-claude-plugin/agents -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
CLAUDE_COMMANDS=$(find generated/nx-claude-plugin/commands -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
CLAUDE_SKILLS=$(find generated/nx-claude-plugin/skills -type d -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
echo "Claude: agents=$CLAUDE_AGENTS, commands=$CLAUDE_COMMANDS, skills=$CLAUDE_SKILLS"

if [ "$AGENTS_COUNT" != "$CLAUDE_AGENTS" ] || [ "$COMMANDS_COUNT" != "$CLAUDE_COMMANDS" ] || [ "$SKILLS_COUNT" != "$CLAUDE_SKILLS" ]; then
  echo "Error: Claude plugin file counts don't match source"
  exit 1
fi

# Verify OpenCode
OPENCODE_AGENTS=$(find generated/.opencode/agents -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
OPENCODE_COMMANDS=$(find generated/.opencode/commands -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
OPENCODE_SKILLS=$(find generated/.opencode/skills -type d -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
echo "OpenCode: agents=$OPENCODE_AGENTS, commands=$OPENCODE_COMMANDS, skills=$OPENCODE_SKILLS"

if [ "$AGENTS_COUNT" != "$OPENCODE_AGENTS" ] || [ "$COMMANDS_COUNT" != "$OPENCODE_COMMANDS" ] || [ "$SKILLS_COUNT" != "$OPENCODE_SKILLS" ]; then
  echo "Error: OpenCode file counts don't match source"
  exit 1
fi

# Verify Copilot
COPILOT_AGENTS=$(find generated/.github/agents -name "*.agent.md" 2>/dev/null | wc -l | tr -d ' ')
COPILOT_PROMPTS=$(find generated/.github/prompts -name "*.prompt.md" 2>/dev/null | wc -l | tr -d ' ')
COPILOT_SKILLS=$(find generated/.github/skills -type d -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
echo "Copilot: agents=$COPILOT_AGENTS, prompts=$COPILOT_PROMPTS, skills=$COPILOT_SKILLS"

if [ "$AGENTS_COUNT" != "$COPILOT_AGENTS" ] || [ "$COMMANDS_COUNT" != "$COPILOT_PROMPTS" ] || [ "$SKILLS_COUNT" != "$COPILOT_SKILLS" ]; then
  echo "Error: Copilot file counts don't match source"
  exit 1
fi

# Verify Cursor (no agents)
CURSOR_COMMANDS=$(find generated/.cursor/commands -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
CURSOR_SKILLS=$(find generated/.cursor/skills -type d -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
echo "Cursor: commands=$CURSOR_COMMANDS, skills=$CURSOR_SKILLS"

if [ "$COMMANDS_COUNT" != "$CURSOR_COMMANDS" ] || [ "$SKILLS_COUNT" != "$CURSOR_SKILLS" ]; then
  echo "Error: Cursor file counts don't match source"
  exit 1
fi

# Verify Gemini (no agents)
GEMINI_COMMANDS=$(find generated/.gemini/commands -name "*.toml" 2>/dev/null | wc -l | tr -d ' ')
GEMINI_SKILLS=$(find generated/.gemini/skills -type d -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
echo "Gemini: commands=$GEMINI_COMMANDS, skills=$GEMINI_SKILLS"

if [ "$COMMANDS_COUNT" != "$GEMINI_COMMANDS" ] || [ "$SKILLS_COUNT" != "$GEMINI_SKILLS" ]; then
  echo "Error: Gemini file counts don't match source"
  exit 1
fi

# Validate TOML syntax for Gemini commands (basic check)
echo ""
echo "Validating Gemini TOML files..."
for toml_file in generated/.gemini/commands/*.toml; do
  if [ -f "$toml_file" ]; then
    # Basic validation: check that file contains 'description =' and 'prompt ='
    if ! grep -q '^description = ' "$toml_file"; then
      echo "Error: $toml_file is missing 'description' field"
      exit 1
    fi
    if ! grep -q '^prompt = ' "$toml_file"; then
      echo "Error: $toml_file is missing 'prompt' field"
      exit 1
    fi
  fi
done
echo "Gemini TOML validation passed"

echo ""
echo "All generated artifacts are up to date and valid!"

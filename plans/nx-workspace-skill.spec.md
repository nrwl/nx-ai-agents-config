---
source: artifacts/skills/nx-workspace/SKILL.md
created: 2026-01-26
status: complete
---

## Nx Workspace Skill Specification

### Problem Statement

The nx-workspace skill provides portable CLI-based exploration of Nx workspaces, replacing MCP tools with commands that work across all AI agents.

### Key Decisions

1. **Scope**: Four use case categories - project discovery, configuration research, dependency analysis, target exploration
2. **Read-only**: Exploration only, no modifications
3. **Integration**: Silent boundary with other skills, no explicit handoffs
4. **Commands**:
   - `nx show projects [flags]` - list/filter projects
   - `nx show project <name> --json` - full resolved config
   - `jq` for JSON extraction
   - Read `nx.json` directly for workspace config
   - Reference `node_modules/nx/schemas` for schema docs
   - Include affected projects (`--affected`)
   - **DISCOURAGED**: Reading `project.json` directly (only partial data)
5. **No MCP tools** - this skill replaces them
6. **No `nx graph`** - browser-based, not processable text output
7. **Trigger**: Broad - any Nx workspace/project/task questions, with examples in description
8. **Structure**: Reference-style, organized by capability

### Files Created/Modified

- `artifacts/skills/nx-workspace/SKILL.md` - Main skill content
- `artifacts/skills/nx-workspace/SKILL.md.meta.json` - Trigger description with examples

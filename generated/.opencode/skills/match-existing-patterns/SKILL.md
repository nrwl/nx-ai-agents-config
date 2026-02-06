---
name: match-existing-patterns
description: 'Follow existing codebase patterns when creating new code artifacts. USE WHEN: (1) creating a new component, service, class, module, endpoint, hook, or other code artifact by hand (not via a generator), (2) user asks to "add a new X" or "create a Y" and no Nx generator applies, (3) you are about to write a new file that has similar counterparts elsewhere in the workspace, (4) you need to integrate with or call an existing function, API, component, or library — find how other consumers use it first. DO NOT use this skill when running an Nx generator (use nx-generate instead, which handles pattern matching internally).'
---

# Match Existing Patterns

Before creating any new code artifact, find and study similar existing artifacts in the workspace. The codebase is the source of truth for conventions — not assumptions, not defaults from documentation.

This skill applies when writing new code by hand (components, services, classes, endpoints, hooks, utilities, tests, etc.). For generator-based scaffolding, use the nx-generate skill instead.

## Steps

### 1. Identify What You're Creating

Classify the artifact: component, service, hook, utility, API endpoint, test, configuration, etc. Be specific — "a React data-fetching hook" is better than "a hook."

### 2. Find Similar Artifacts

Search the workspace for existing artifacts of the same type. Use multiple strategies:

```bash
# Find projects with similar tags
nx show projects -p 'tag:type:ui'

# Search for similar file patterns
# e.g., finding all service files, hook files, etc.
```

Use Glob to find files matching patterns like `**/*.service.ts`, `**/*.hook.ts`, `**/use*.ts`, `**/*.controller.ts`, etc.

Prioritize artifacts that are:

- In the same project or a sibling project
- Tagged similarly (same scope, same type)
- Recently modified (more likely to reflect current conventions)

**Find at least one concrete example before writing any code.** If no similar artifact exists in the workspace, state that explicitly and proceed with reasonable defaults.

### 3. Study the Example

Read the example artifact fully. Extract:

- **File location and naming**: Where does it live? What's the naming convention? (e.g., `kebab-case.service.ts`, `useCamelCase.ts`, `PascalCase.tsx`)
- **File structure**: What's the internal organization? Imports first, then types, then implementation? Are there barrel exports?
- **Patterns**: How are dependencies injected? How is state managed? How are errors handled? What's the export style (named vs default)?
- **Testing**: Is there a co-located test file? What testing library and patterns are used? What's the test naming convention?
- **Configuration**: Is there a project-level config (e.g., `.eslintrc`, `tsconfig.json`) that affects how code should be written?

### 4. Find Usage Examples of Existing APIs

When integrating with an existing function, component, API endpoint, or library, find how other consumers already use it before writing your own integration.

**Find dependents of a project:**

```bash
# Find all projects that depend on a specific library
nx graph --print | jq '.graph.dependencies | to_entries[] | select(.value[].target == "my-lib") | .key'
```

Then examine those dependent projects for concrete usage examples — how they import, call, configure, and handle errors from the API you need to use.

**Find call sites of a specific function or class:**

Use language-aware tools when available (e.g., "find references", "go to references" via IDE/LSP tooling). Otherwise, search with Grep for the function/class name across the workspace.

**What to extract from usage examples:**

- How is the API imported? (path alias, barrel export, direct file import)
- What arguments/props/config are typically passed?
- How are return values or responses handled?
- What error handling wraps the call?
- Are there setup/teardown patterns (e.g., provider wrappers, initialization)?

**Find at least one real consumer before writing new integration code.** Existing usage is more reliable than API docs alone — it shows what actually works in this codebase.

### 5. Apply Patterns to New Code

Write the new artifact following the conventions extracted in step 3. Match:

- File naming and placement
- Internal code structure and organization
- Import style and ordering
- Export patterns
- Error handling approach
- Type definition patterns
- Test structure (if creating tests)

### 6. Verify Consistency

After writing, compare the new artifact side-by-side with the example. Check for unintentional deviations in style, structure, or patterns.

Run lint to catch convention violations:

```bash
nx lint <project-name>
```

## Anti-Patterns

- **NEVER assume conventions.** "React components usually use default exports" — maybe, but this codebase might use named exports exclusively. Check first.
- **NEVER copy from external docs/templates** without verifying they match the workspace's conventions. A Next.js tutorial's file structure may differ from this repo's.
- **NEVER skip this process for "simple" files.** Even a small utility file has conventions (location, naming, exports, tests) that should match existing patterns.
- **NEVER mix conventions** from different parts of the codebase. If a project uses one pattern and another project uses a different pattern, follow the convention of the project you're working in.

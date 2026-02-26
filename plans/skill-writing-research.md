# Research: Writing Effective Skills for AI Coding Agents

## Sources

- Anthropic official docs: [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- Anthropic engineering blog: [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Anthropic skills blog: [Equipping agents for the real world with agent skills](https://claude.com/blog/equipping-agents-for-the-real-world-with-agent-skills)
- [Progressive Disclosure Matters](https://www.honra.ai/articles/progressive-disclosure-for-ai-agents)
- GitHub Blog: [5 tips for writing better custom instructions](https://github.blog/ai-and-ml/github-copilot/5-tips-for-writing-better-custom-instructions-for-copilot/)
- Trigger.dev: [How to write great Cursor Rules](https://trigger.dev/blog/cursor-rules)
- Martin Fowler: [Context Engineering for Coding Agents](https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html)
- arXiv: [AGENTS.md impact study](https://arxiv.org/html/2601.20404)
- Analysis of 6 existing skills in this repository (nx-workspace, monitor-ci, nx-generate, link-workspace-packages, nx-run-tasks, nx-plugins)

---

## 1. The Core Principle: Context is Finite Currency

The single most important insight across all sources: **every token competes for the model's attention**. Research on "context rot" shows that as token volume increases, model accuracy and recall degrade. The goal is to find "the smallest possible set of high-signal tokens that maximize the likelihood of some desired outcome."

This means:

- Only include information Claude does not already know
- Challenge each paragraph: "Does this justify its token cost?"
- More information does not guarantee better results -- excessive context actually diminishes effectiveness
- Frontier LLMs can follow approximately 150-200 instructions with reasonable consistency; beyond that, quality drops

---

## 2. Progressive Disclosure (Three-Layer Architecture)

The key architectural pattern for managing context efficiently. All major platforms implement some version of this.

### Layer 1: Metadata (always loaded, ~100 words per skill)

Only `name` and `description` are kept in context at all times (subject to a 15,000-character budget across all skills). These serve as **routing mechanisms** -- they determine when a skill activates.

### Layer 2: SKILL.md body (loaded on trigger, target <500 lines / ~2,000 words)

Core concepts, essential procedures, quick references, and pointers to deeper content. This is the "onboarding guide" for the domain.

### Layer 3: Bundled resources (loaded on demand, unlimited size)

- `references/` -- detailed docs, schemas, API references
- `examples/` -- complete working code samples
- `scripts/` -- executable utilities (run without loading into context)
- `assets/` -- templates, images used in output

**Critical rules:**

- Keep disclosure shallow: 2-3 layers maximum, never deeply nested references
- Information should live in EITHER SKILL.md OR reference files, never both
- For reference files >100 lines, include a table of contents at the top
- Scripts are the most token-efficient resource: they execute without being read into context

---

## 3. The Description Field: Most Critical Piece

The `description` in frontmatter/metadata is the single most important field. It determines **when** Claude activates the skill from potentially 100+ available skills.

### Rules for effective descriptions

- **Write in third person**: "This skill should be used when..." not "Use this skill when..."
- **Include specific trigger phrases in quotes**: `"create a hook"`, `"scaffold a library"`, `"cannot find module"`
- **List concrete scenarios with numbers**: "USE WHEN: (1) you just created new packages... (2) user imports from a sibling..."
- **Include error codes/messages** that should trigger the skill: `'TS2307'`, `'Cannot find configuration for task'`
- **Add behavioral directives**: "ALWAYS use this BEFORE calling nx_docs" or "ALWAYS USE THIS SKILL instead of native CI provider tools"
- **Never be vague**: "Provides guidance for working with X" is useless

### Examples from this repo ranked by effectiveness

**Best** -- nx-generate:

> "INVOKE IMMEDIATELY when user mentions scaffolding, setup, structure, creating apps/libs... Trigger words - scaffold, setup, create a ... app..."

**Best** -- link-workspace-packages:

> "USE WHEN: (1) you just created or generated new packages... (2) user imports from a sibling package... (3) you get resolution errors... like 'cannot find module', 'TS2307'"

**Good** -- monitor-ci:

> "USE WHEN user says 'monitor ci', 'watch ci', 'ci monitor'... ALWAYS USE THIS SKILL instead of native CI provider tools"

---

## 4. Writing Style

### Use imperative/infinitive form (verb-first)

- Correct: "Parse the frontmatter using sed. Extract fields with grep."
- Incorrect: "You should parse the frontmatter... Claude should extract fields..."

### Third person in descriptions only

- Description: "This skill should be used when the user asks to..."
- Body: "Run the generator with `--dry-run` first."

### Be specific, not prescriptive

Anthropic calls this "the right altitude":

- Too prescriptive = brittle, maintenance-heavy, doesn't adapt to edge cases
- Too vague = insufficient signals, unpredictable behavior
- Sweet spot: "specific enough to guide behavior effectively, yet flexible enough to provide strong heuristics"

---

## 5. Degrees of Freedom

Match specificity to the task's fragility:

| Freedom Level | When to Use                                                          | Format                             |
| ------------- | -------------------------------------------------------------------- | ---------------------------------- |
| **High**      | Multiple valid approaches, context-dependent decisions               | Text-based instructions            |
| **Medium**    | Preferred pattern exists but some variation acceptable               | Pseudocode/scripts with parameters |
| **Low**       | Fragile operations, consistency critical, specific sequence required | Exact scripts, no parameters       |

Example: "Always run with `--dry-run` first" = low freedom (fragile operation). "Choose an appropriate test framework" = high freedom (context-dependent).

---

## 6. Content Structure Patterns

### Pattern A: Read-Only / Exploration Skills

```
# Title
Brief intro

## How to [main action]
### Variation 1 with examples
### Variation 2 with examples

## Common Patterns
Real-world use cases

## Troubleshooting
Error scenarios and solutions
```

### Pattern B: Complex Action / Workflow Skills

```
# Title
Intro + context

## Key Principles
Critical rules (bulleted)

## Steps
### Step 1: Discovery
### Step 2: Selection
### Step 3: Implementation

## Decision Tables
Status -> action mappings

## Error Handling
Error -> response table

## Examples
Full example sessions
```

### What makes content effective

1. **Decision tables** mapping states/inputs to actions (monitor-ci excels at this)
2. **Copy-paste-ready examples** with both correct and incorrect versions
3. **Numbered sequential steps** with prerequisites and loops ("Go back to Step X if...")
4. **Anti-patterns section** explicitly warning "NEVER DO X because Y"
5. **Progressive complexity** -- start with simple cases, end with advanced patterns
6. **Cross-references** to other skills: "Use the link-workspace-packages skill when..."

---

## 7. Bundled Resources: When to Use What

| Resource Type   | Use When                                                                  | Token Impact                     |
| --------------- | ------------------------------------------------------------------------- | -------------------------------- |
| **scripts/**    | Same code would be rewritten repeatedly; deterministic reliability needed | Lowest (execute without reading) |
| **references/** | Domain knowledge, schemas, API docs needed during execution               | Medium (loaded on demand)        |
| **examples/**   | Complete runnable code samples users can copy/adapt                       | Medium (loaded on demand)        |
| **assets/**     | Templates, images, boilerplate for output                                 | None (never loaded into context) |

Only create subdirectories that are actually needed.

---

## 8. Multi-Agent Distribution Considerations

This repository distributes skills to 5 agents (Claude, Cursor, Copilot, OpenCode, Gemini). Key differences:

| Feature           | Claude                | Cursor        | Copilot         | Gemini     |
| ----------------- | --------------------- | ------------- | --------------- | ---------- |
| Frontmatter       | YAML                  | YAML          | YAML            | TOML       |
| Arguments         | `$ARGUMENTS`          | removed       | `${input:args}` | `{{args}}` |
| Tool restrictions | `allowed-tools` field | N/A           | N/A             | N/A        |
| Model hints       | `model: haiku`        | `model: fast` | N/A             | N/A        |
| Subagent support  | Yes                   | No            | No              | No         |

Write skills in an agent-agnostic way where possible, using the `$ARGUMENTS` placeholder for dynamic values.

---

## 9. Cross-Platform Universal Best Practices

These patterns appear consistently across Claude Code, Cursor, Copilot, and general prompt engineering literature:

| Principle                     | Details                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| **Be concise**                | Only include what the model doesn't already know. Challenge every paragraph. |
| **Progressive disclosure**    | Metadata first, details on demand, deep references only when needed.         |
| **Right altitude**            | Not too prescriptive (brittle), not too vague (unpredictable).               |
| **Structure with headers**    | Markdown headers, bullets, code blocks. Make content scannable.              |
| **Concrete examples**         | Complete implementations, not isolated snippets. Show correct AND incorrect. |
| **Clear defaults**            | One recommended approach with escape hatches, not a buffet of options.       |
| **Explain the why**           | Brief rationale helps the model make better edge-case decisions.             |
| **Shallow references**        | One level deep maximum. No nested reference chains.                          |
| **Invest in descriptions**    | Descriptions are routing mechanisms. They determine activation.              |
| **Start minimal, iterate**    | Imperfect instructions beat none. Add based on observed failure modes.       |
| **Consistent terminology**    | Pick one term per concept and use it everywhere.                             |
| **No time-sensitive content** | Use "current"/"deprecated" labels, not dates that go stale.                  |

---

## 10. Common Mistakes to Avoid

1. **Weak trigger descriptions** -- vague like "Provides guidance for working with hooks" instead of listing specific trigger phrases and error messages
2. **Everything in SKILL.md** -- 8,000 words in one file instead of 2,000 + reference files
3. **Second person writing** -- "You should..." instead of imperative "Start by..."
4. **Missing resource references** -- having references/ directory but not mentioning files in SKILL.md
5. **Explaining what LLMs already know** -- "A PDF is a document format..." wastes tokens
6. **Offering too many options** -- present a buffet instead of a clear default with escape hatches
7. **Deeply nested references** -- references that reference other references; Claude may only partially read them
8. **No anti-patterns section** -- failing to warn against wrong approaches
9. **Missing edge cases** -- not documenting common gotchas (like `--directory` flag behavior in nx-generate)
10. **Not testing across models** -- what works for Opus may need more detail for Haiku

---

## 11. Development Process

### Recommended workflow (from Anthropic)

1. **Start with a real task** -- identify a reusable pattern from actual usage
2. **Build evaluations first** -- define what "correct" looks like before writing the skill
3. **Use "Claude A/B" testing** -- write with one Claude instance, test with a fresh one
4. **Start minimal** -- begin with the simplest version that could work
5. **Iterate on observed failures** -- add detail based on what goes wrong, not preemptively
6. **Validate structure** -- frontmatter present, description includes triggers, body uses imperative form, size under 500 lines, all referenced files exist, examples are complete

### This repo's validation checklist (from meta.json patterns)

- [ ] `name` and `description` present in metadata
- [ ] Description includes specific trigger phrases in quotes
- [ ] Description includes "USE WHEN" scenarios
- [ ] Body uses imperative form, not second person
- [ ] SKILL.md is under 500 lines / ~2,000 words
- [ ] All referenced files exist
- [ ] Examples are complete and correct
- [ ] Scripts are executable
- [ ] `allowed-tools` specified if skill needs tool restrictions
- [ ] `command`/`subagent` flags set correctly

---

## 12. Skill Size Spectrum (from this repo)

Skills should match the complexity of their domain:

| Skill                   | Lines | Why This Size                                 |
| ----------------------- | ----- | --------------------------------------------- |
| nx-plugins              | 4     | Domain is trivial (2 commands)                |
| nx-run-tasks            | 53    | Simple domain, 5 use cases                    |
| link-workspace-packages | 122   | Moderate complexity, 4 package managers       |
| nx-generate             | 158   | Complex decisions, critical gotchas           |
| nx-workspace            | 311   | Comprehensive exploration reference           |
| monitor-ci              | 502   | State machine, decision trees, error handling |

There's no "right" size -- a 4-line skill for a trivial task is better than a padded 200-line one.

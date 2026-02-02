# Run Nx Generator

Nx generators are powerful tools that scaffold projects, make automated code migrations or automate repetitive tasks in a monorepo. They ensure consistency across the codebase and reduce boilerplate work.

This skill applies when the user wants to:

- Create new projects like libraries or applications
- Scaffold features or boilerplate code
- Run workspace-specific or custom generators
- Do anything else that an nx generator exists for

## Key Principles

1. **Always use `--no-interactive`** - Prevents prompts that would hang execution
2. **Read the generator source code** - The schema alone is not enough; understand what the generator actually does
3. **Dry-run first** - Always verify file placement before running for real
4. **Match existing repo patterns** - Study similar artifacts in the repo and follow their conventions
5. **Verify with lint/test/build** - Generated code must pass verification

## Steps

### 1. Discover Available Generators

Use the Nx CLI to discover available generators:

- List all generators for a plugin: `npx nx list @nx/react`
- View available plugins: `npx nx list`

This includes plugin generators (e.g., `@nx/react:library`) and local workspace generators.

### 2. Match Generator to User Request

Identify which generator(s) could fulfill the user's needs. Consider what artifact type they want, which framework is relevant, and any specific generator names mentioned.

**IMPORTANT**: When both a local workspace generator and an external plugin generator could satisfy the request, **always prefer the local workspace generator**. Local generators are customized for the specific repo's patterns.

If no suitable generator exists, you can stop using this skill. However, the burden of proof is high—carefully consider all available generators before deciding none apply.

### 3. Get Generator Options

Use the `--help` flag to understand available options:

```bash
npx nx g @nx/react:library --help
```

Pay attention to required options, defaults that might need overriding, and options relevant to the user's request.

### 4. Read Generator Source Code

**This step is critical.** The schema alone does not tell you everything. Reading the source code helps you:

- Know exactly what files will be created/modified and where
- Understand side effects (updating configs, installing deps, etc.)
- Identify behaviors and options not obvious from the schema
- Understand how options interact with each other

To find generator source code:

- For plugin generators: Use `node -e "console.log(require.resolve('@nx/<plugin>/generators.json'));"` to find the generators.json, then locate the source from there
- If that fails, read directly from `node_modules/<plugin>/generators.json`
- For local generators: Typically in `tools/generators/` or a local plugin directory. Search the repo for the generator name.

After reading the source, reconsider: Is this the right generator? If not, go back to step 2.

> **⚠️ COMMON MISCONCEPTION: `--directory` flag**
>
> The `--directory` option behaves differently across generators. Do NOT assume you know how it works. Some generators use it as the full path where files should be created, others use it as a parent directory, and some combine it with `--name` in unexpected ways. **Always read the generator source code** to understand exactly how `--directory` is used before running the generator.

### 5. Examine Existing Patterns

Before generating, examine the target area of the codebase:

- Look at similar existing artifacts (other libraries, applications, etc.)
- Identify naming conventions, file structures, and configuration patterns
- Note which test runners, build tools, and linters are used
- Configure the generator to match these patterns

### 6. Dry-Run to Verify File Placement

**Always run with `--dry-run` first** to verify files will be created in the correct location:

```bash
npx nx g @nx/react:library --name=my-lib --dry-run --no-interactive
```

Review the output carefully. If files would be created in the wrong location, adjust your options based on what you learned from the generator source code.

Note: Some generators don't support dry-run (e.g., if they install npm packages). If dry-run fails for this reason, proceed to running the generator for real.

### 7. Run the Generator

Execute the generator:

```bash
nx generate <generator-name> <options> --no-interactive
```

If the generator fails:

1. Read the error message carefully
2. Adjust options or resolve conflicts
3. Retry with corrected options

### 8. Modify Generated Code (If Needed)

Generators provide a starting point. Modify the output as needed to:

- Add or modify functionality as requested
- Adjust imports, exports, or configurations
- Integrate with existing code patterns

### 9. Format and Verify

Format all generated/modified files:

```bash
nx format --fix
```

Then verify the generated code works:

```bash
nx lint <new-project>
nx test <new-project>
nx build <new-project>
```

If verification fails with manageable issues (a few lint errors, minor type issues), fix them. If issues are extensive, attempt obvious fixes first, then escalate to the user with details about what was generated, what's failing, and what you've attempted.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors

<!-- nx configuration end-->

When writing regular skills and agents in this repo (in /artifacts), always use agent-agnostic language. There are many different ways of representing MCP tool formats, different default subagents et cetera. Since we generally support all these subagents from the same source files, always use descriptions that will make sense for different coding agents.
Don't do this: "Use the mcp\_\_nx-mcp\_\_ci_information MCP tool"
Do this instead: "Use the ci-information tool from the nx MCP server" (you don't always have to mention the mcp server if it's obvious)

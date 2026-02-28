## Turborepo

- Nx can replace Turborepo task orchestration, but a clean migration still requires validating project setup after import.
- Use the migration guide for the automated flow and config mapping details: https://nx.dev/docs/guides/adopting-nx/from-turborepo#easy-automated-migration-example
- This doc contains information for how to transform turborepo configuration into nx configuration
- It's important to do this before a migration can be considered done - since nx replaces turborepo for task orchestration, turbo config becomes dead code
- Make sure to remove all turbo config files AFTER transforming it into nx config

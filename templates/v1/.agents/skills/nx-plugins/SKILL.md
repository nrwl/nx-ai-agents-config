---
name: nx-plugins
description: Find and add Nx plugins. USE WHEN user wants to discover available plugins, install a new plugin, or add support for a specific framework or technology to the workspace.
---
## Finding and Installing new plugins

- List plugins: `<%= pm ? pm.nx : 'nx' %> list`
- Install plugins `<%= pm ? pm.nx : 'nx' %> add <plugin>`. Example: `<%= pm ? pm.nx : 'nx' %> add @nx/react`.

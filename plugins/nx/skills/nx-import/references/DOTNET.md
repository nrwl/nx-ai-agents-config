## .NET

- `nx import` detects `@nx/dotnet` from `*.csproj`, `*.fsproj` and `*.vbproj` files, for whole-repo and subdirectory imports alike. Accept it with `--plugins=@nx/dotnet`.
- The `@nx/dotnet` analyzer runs MSBuild, so the .NET SDK (8.0 or newer) must be on `PATH` for the project graph to build.
- Nx names each project after its project file (`Shop.Api.csproj` → `Shop.Api`), not after the destination directory. Nx reads project files, not the solution (`.sln`/`.slnx`).
- `nx import` adds the destination directory to the root `package.json` `workspaces` (or `pnpm-workspace.yaml`) even though .NET projects have no `package.json`. Remove that entry.
- Run `nx show projects` and `nx graph` to confirm every project and its `ProjectReference` dependencies were inferred.

### Restore Before the First Build (Critical)

`build` runs `dotnet build --no-restore`, and `obj/` is gitignored, so the first build after an import fails with `NETSDK1004: Assets file '.../obj/project.assets.json' not found`.

**Fix**: Run `dotnet restore` on the solution or on each project before running Nx tasks. To have Nx run it, set `"restore": true` in the `@nx/dotnet` plugin options.

- If a build already failed this way, Nx reports the next successful run as a flaky task. Ignore it.
- If a test project has no `test` target after restoring, run `nx reset`.

### Shared Root Files (Critical for Subdirectory Import)

MSBuild, NuGet and the SDK read these from the nearest ancestor directory: `Directory.Build.props`, `Directory.Build.targets`, `Directory.Packages.props`, `global.json`, `nuget.config`. A subdirectory import (`--source=src`) leaves the source's root copies behind.

**Symptoms**:

- `NETSDK1013: The TargetFramework value '' was not recognized` when `TargetFramework` was set in `Directory.Build.props`.
- With central package management, `PackageReference` items have no `Version`. Without `Directory.Packages.props`, restore only warns `NU1604` and silently resolves the lowest available versions.

**Fix**: Copy the files to a common ancestor of the imported projects, usually the workspace root, then run `dotnet restore` again.

- If the destination already has these files, merge them. MSBuild reads only the nearest `Directory.Build.props` and `Directory.Packages.props`, and the SDK reads only the nearest `global.json`.
- A whole-repo import keeps the files beside its projects, so builds work. In a destination with its own root files, the imported copies shadow them. To inherit the root `Directory.Build.props`, import it from the nested one: `<Import Project="$([MSBuild]::GetPathOfFileAbove('Directory.Build.props', '$(MSBuildThisFileDirectory)../'))" />`.

### ProjectReference Paths (Critical)

`<ProjectReference Include="..\..\src\Shop.Core\Shop.Core.csproj" />` paths are relative. Importing source directories into differently named destinations (`src` → `apps` while `tests` → `tests`) breaks every reference that crosses them.

A dangling reference makes the `@nx/dotnet` analyzer throw `Could not find a part of the path '.../Shop.Core.csproj'`, and the whole project graph fails. Every Nx command fails, not just the .NET ones.

**Fix**: Keep the source's relative layout (e.g. import `src` and `tests` under one parent such as `dotnet/src` and `dotnet/tests`), or update the `Include` paths right after each import.

When importing several subdirectories one at a time, fix the references before the next `nx import`. If `@nx/dotnet` is already installed and the graph fails, `nx import` crashes after the merge commit with `Cannot read properties of null (reading 'startsWith')` and skips plugin installation. Fix the paths, then run `nx add @nx/dotnet` if it is missing from `nx.json`.

Helpful docs:

- https://nx.dev/docs/technologies/dotnet/introduction

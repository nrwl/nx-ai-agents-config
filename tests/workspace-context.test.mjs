import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import ejs from 'ejs';
import {
  transformContent,
  renderWorkspaceTokens,
} from '../scripts/sync-artifacts.mjs';

const rootDir = join(import.meta.dirname, '..');

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}

const YARN = {
  pm: {
    name: 'yarn',
    nx: 'yarn nx',
    exec: 'yarn',
    dlx: 'yarn dlx',
    add: 'yarn add',
    addDev: 'yarn add -D',
    install: 'yarn',
    workspaceGlobFile: 'package.json `workspaces`',
    supportsWorkspaceProtocol: true,
  },
};

describe('renderWorkspaceTokens', () => {
  it('leaves tokens intact when preserving (templates/ output)', () => {
    const content = 'Run `<%= pm.nx %> build`';
    expect(renderWorkspaceTokens(content, true, 'codex')).toBe(content);
  });

  it('renders the unknown-workspace branch against the empty context (generated/ output)', () => {
    const content =
      '<% if (pm) { %>Use <%= pm.nx %><% } else { %>Check the lockfile<% } %>';
    expect(renderWorkspaceTokens(content, false, 'codex')).toBe(
      'Check the lockfile'
    );
  });

  it('fails the build on an unguarded workspace fact', () => {
    // The whole point of rendering generated/ against the empty context: an unguarded
    // token cannot reach a user, because released nx runs ejs.render(content, {}) on
    // every file it copies and would throw ReferenceError at their terminal instead.
    expect(() => renderWorkspaceTokens('Run <%= pm.nx %>', false, 'codex')).toThrow(
      /Workspace-context template error/
    );
  });
});

describe('transformContent', () => {
  it('resolves Liquid at build time and leaves EJS for nx when preserving', () => {
    const content =
      '{% if platform == "codex" %}codex{% else %}other{% endif %}: <%= pm.nx %>';
    expect(transformContent(content, 'codex', true)).toBe('codex: <%= pm.nx %>');
  });
});

describe('generated/ and skills/', () => {
  // Released versions of nx copy these files through ejs.render(content, {}). A surviving
  // `<%= pm.nx %>` there is not a cosmetic bug — it throws ReferenceError and breaks
  // `nx configure-ai-agents` for every already-installed nx, since the config repo is
  // cloned at unpinned HEAD.
  it.each(['generated', 'skills'])(
    '%s/ contains no unresolved EJS tokens',
    (dir) => {
      const offenders = walk(join(rootDir, dir)).filter((f) =>
        readFileSync(f, 'utf-8').includes('<%')
      );
      expect(offenders).toEqual([]);
    }
  );
});

describe('templates/v1', () => {
  const templateFiles = walk(join(rootDir, 'templates', 'v1'));

  it('is populated', () => {
    expect(templateFiles.length).toBeGreaterThan(0);
  });

  it('every template renders against a populated context', () => {
    for (const file of templateFiles) {
      expect(() =>
        ejs.render(readFileSync(file, 'utf-8'), YARN)
      ).not.toThrow();
    }
  });

  it('every template also renders against the empty context', () => {
    for (const file of templateFiles) {
      expect(() => ejs.render(readFileSync(file, 'utf-8'), { pm: null })).not.toThrow();
    }
  });

  it('states the package manager instead of asking the agent to detect it', () => {
    const plugins = join(
      rootDir,
      'templates/v1/.agents/skills/nx-plugins/SKILL.md'
    );
    const rendered = ejs.render(readFileSync(plugins, 'utf-8'), YARN);
    expect(rendered).toContain('`yarn nx list`');
    expect(rendered).not.toContain('pnpm nx');
  });

  it('does not rewrite pnpm where pnpm is the subject rather than the command', () => {
    // link-workspace-packages documents each package manager in turn. Rendering it for a
    // yarn workspace must not touch the `## pnpm` section — that section is *about* pnpm.
    const skill = join(
      rootDir,
      'templates/v1/.agents/skills/link-workspace-packages/SKILL.md'
    );
    const rendered = ejs.render(readFileSync(skill, 'utf-8'), YARN);
    expect(rendered).toContain('## pnpm');
    expect(rendered).toContain('pnpm add @org/ui --filter @org/app --workspace');
  });
});

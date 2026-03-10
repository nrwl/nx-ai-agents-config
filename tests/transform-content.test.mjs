import { describe, it, expect } from 'vitest';
import { transformContent } from '../scripts/sync-artifacts.mjs';

describe('transformContent', () => {
  describe('non-opencode agents', () => {
    it('returns content unchanged for claude', () => {
      const content =
        'Use mcp__plugin_nx_nx-mcp__ci_information and Task(subagent) in Claude Code';
      expect(transformContent(content, 'claude')).toBe(content);
    });

    it('returns content unchanged for copilot', () => {
      const content = 'mcp__nx-mcp__cloud_polygraph_init() with Task(foo)';
      expect(transformContent(content, 'copilot')).toBe(content);
    });

    it('returns content unchanged for cursor', () => {
      const content = 'Claude Code is great';
      expect(transformContent(content, 'cursor')).toBe(content);
    });

    it('returns content unchanged for gemini', () => {
      const content = 'mcp__plugin_nx_nx-mcp__ci_information';
      expect(transformContent(content, 'gemini')).toBe(content);
    });

    it('returns content unchanged for codex', () => {
      const content = 'Task(subagent_type: "general-purpose")';
      expect(transformContent(content, 'codex')).toBe(content);
    });
  });

  describe('opencode agent', () => {
    it('replaces mcp__plugin_nx_nx-mcp__ prefix with polygraph_', () => {
      const input = 'Use mcp__plugin_nx_nx-mcp__ci_information tool';
      const result = transformContent(input, 'opencode');
      expect(result).toBe('Use polygraph_ci_information tool');
      expect(result).not.toContain('mcp__plugin_nx');
    });

    it('replaces mcp__nx-mcp__ prefix with polygraph_', () => {
      const input = 'Call mcp__nx-mcp__cloud_polygraph_init()';
      const result = transformContent(input, 'opencode');
      expect(result).toBe('Call polygraph_cloud_polygraph_init()');
      expect(result).not.toContain('mcp__nx-mcp__');
    });

    it('replaces both prefix patterns in the same content', () => {
      const input = [
        '**Prefix 1:** `mcp__nx-mcp__`',
        '**Prefix 2:** `mcp__plugin_nx_nx-mcp__`',
        '',
        'mcp__nx-mcp__cloud_polygraph_init()',
        'mcp__plugin_nx_nx-mcp__cloud_polygraph_init()',
      ].join('\n');
      const result = transformContent(input, 'opencode');
      expect(result).not.toContain('mcp__plugin_nx');
      expect(result).not.toContain('mcp__nx-mcp__');
      expect(result).toContain('polygraph_');
    });

    it('strips lines containing Task( subagent invocations', () => {
      const input = [
        'Some instruction text',
        'Task(subagent_type: "general-purpose", description: "Init")',
        'More text after',
      ].join('\n');
      const result = transformContent(input, 'opencode');
      expect(result).not.toContain('Task(');
      expect(result).toContain('Some instruction text');
      expect(result).toContain('More text after');
    });

    it('strips multi-line Task() blocks', () => {
      const input = [
        'Before task',
        '```',
        'Task(',
        '  subagent_type: "general-purpose",',
        '  run_in_background: true,',
        '  description: "Delegate to repo",',
        '  prompt: "do something"',
        ')',
        '```',
        'After task',
      ].join('\n');
      const result = transformContent(input, 'opencode');
      expect(result).not.toMatch(/\bTask\s*\(/);
      expect(result).toContain('Before task');
      expect(result).toContain('After task');
    });

    it('replaces "Claude Code" with "AI agent"', () => {
      const input = 'Claude Code is a tool for development';
      const result = transformContent(input, 'opencode');
      expect(result).toBe('AI agent is a tool for development');
      expect(result).not.toContain('Claude Code');
    });

    it('cleans up multiple consecutive blank lines', () => {
      const input = 'Line 1\n\n\n\n\nLine 2';
      const result = transformContent(input, 'opencode');
      expect(result).toBe('Line 1\n\nLine 2');
    });

    it('handles realistic polygraph skill content', () => {
      const input = [
        '# Multi-Repo Coordination with Polygraph',
        '',
        'Use the mcp__plugin_nx_nx-mcp__cloud_polygraph_init tool.',
        'Or try mcp__nx-mcp__cloud_polygraph_init as fallback.',
        '',
        'Launch via Claude Code:',
        '',
        '```',
        'Task(',
        '  subagent_type: "general-purpose",',
        '  description: "Init Polygraph session",',
        '  prompt: "Initialize session"',
        ')',
        '```',
        '',
        'After init, use mcp__plugin_nx_nx-mcp__cloud_polygraph_delegate.',
      ].join('\n');

      const result = transformContent(input, 'opencode');

      // Tool prefixes replaced
      expect(result).not.toContain('mcp__plugin_nx');
      expect(result).not.toContain('mcp__nx-mcp__');
      expect(result).toContain('polygraph_cloud_polygraph_init');
      expect(result).toContain('polygraph_cloud_polygraph_delegate');

      // Task() blocks removed
      expect(result).not.toMatch(/\bTask\s*\(/);

      // Claude Code replaced
      expect(result).not.toContain('Claude Code');
      expect(result).toContain('AI agent');

      // Structural content preserved
      expect(result).toContain('# Multi-Repo Coordination with Polygraph');
      expect(result).toContain('After init, use');
    });

    it('handles get-latest-ci skill content with Task and MCP references', () => {
      const input = [
        '## Step 1: Fetch CI Status via Subagent',
        '',
        'Spawn a `general-purpose` subagent using the Task tool.',
        '',
        'Use the mcp__nx-mcp__ci_information MCP tool (or mcp__plugin_nx_nx-mcp__ci_information).',
        '',
        '```',
        'Task(',
        '  subagent_type: "general-purpose",',
        '  description: "Fetch latest CI status",',
        '  prompt: "Fetch CI data"',
        ')',
        '```',
      ].join('\n');

      const result = transformContent(input, 'opencode');
      // MCP prefixes outside Task() blocks are replaced
      expect(result).not.toContain('mcp__plugin_nx');
      expect(result).not.toContain('mcp__nx-mcp__');
      expect(result).toContain('polygraph_ci_information');
      // Task() blocks are stripped
      expect(result).not.toMatch(/\bTask\s*\(/);
    });

    it('does not modify content without Claude-specific patterns', () => {
      const input =
        'This is plain content with no special patterns.\nJust regular text.';
      const result = transformContent(input, 'opencode');
      expect(result).toBe(input);
    });
  });
});

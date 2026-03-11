import { describe, it, expect } from 'vitest';
import { transformContent } from '../scripts/sync-artifacts.mjs';

// Platform keys matching createPlatformConfigs config keys
const configs = {
  claude: 'claude',
  opencode: 'opencode',
  copilot: 'copilot',
  cursor: 'cursor',
  gemini: 'gemini',
  codex: 'codex',
};

const nonClaudePlatforms = ['opencode', 'copilot', 'cursor', 'gemini', 'codex'];

describe('transformContent', () => {
  describe('if/else conditional rendering', () => {
    it('renders the Claude branch for claude platform', () => {
      const content = [
        'Before',
        '{%- if platform == "claude" %}',
        'Claude-specific content',
        '{%- else %}',
        'Other agent content',
        '{%- endif %}',
        'After',
      ].join('\n');
      const result = transformContent(content, configs.claude);
      expect(result).toContain('Claude-specific content');
      expect(result).not.toContain('Other agent content');
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });

    it('renders the else branch for every non-Claude platform', () => {
      const content = [
        'Before',
        '{%- if platform == "claude" %}',
        'Claude-specific content',
        '{%- else %}',
        'Other agent content',
        '{%- endif %}',
        'After',
      ].join('\n');
      for (const key of nonClaudePlatforms) {
        const result = transformContent(content, configs[key]);
        expect(result).not.toContain('Claude-specific content');
        expect(result).toContain('Other agent content');
        expect(result).toContain('Before');
        expect(result).toContain('After');
      }
    });
  });

  describe('if-only conditional (no else)', () => {
    it('keeps content for claude', () => {
      const content = [
        'Before',
        '{%- if platform == "claude" %}',
        'Claude-only block',
        '{%- endif %}',
        'After',
      ].join('\n');
      const result = transformContent(content, configs.claude);
      expect(result).toContain('Claude-only block');
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });

    it('strips content for non-Claude platforms', () => {
      const content = [
        'Before',
        '{%- if platform == "claude" %}',
        'Claude-only block',
        '{%- endif %}',
        'After',
      ].join('\n');
      for (const key of nonClaudePlatforms) {
        const result = transformContent(content, configs[key]);
        expect(result).not.toContain('Claude-only block');
        expect(result).toContain('Before');
        expect(result).toContain('After');
      }
    });
  });

  describe('{% raw %} blocks', () => {
    it('passes through code fence content inside a conditional unchanged', () => {
      const content = [
        '{%- if platform == "claude" %}',
        '',
        '{% raw %}```',
        'Task(',
        '  agent: "ci-monitor-subagent",',
        '  prompt: "{{ some_var }}"',
        ')',
        '```{% endraw %}',
        '{%- else %}',
        'Call the tool directly.',
        '{%- endif %}',
      ].join('\n');
      const result = transformContent(content, configs.claude);
      expect(result).toContain('{{ some_var }}');
      expect(result).toContain('Task(');
      expect(result).not.toContain('{% raw %}');
      expect(result).not.toContain('{% endraw %}');
    });

    it('strips raw block when inside a non-matching conditional branch', () => {
      const content = [
        '{%- if platform == "claude" %}',
        '',
        '{% raw %}```',
        'Task(',
        '  prompt: "{{ some_var }}"',
        ')',
        '```{% endraw %}',
        '{%- else %}',
        'Call the tool directly.',
        '{%- endif %}',
      ].join('\n');
      const result = transformContent(content, configs.opencode);
      expect(result).not.toContain('Task(');
      expect(result).toContain('Call the tool directly.');
    });
  });

  describe('plain content passthrough', () => {
    it('passes through content with no Liquid tags unchanged for claude', () => {
      const content =
        'Plain content with no special syntax.\nJust regular text.';
      expect(transformContent(content, configs.claude)).toBe(content);
    });

    it('passes through content with no Liquid tags unchanged for non-Claude (no Claude Code ref)', () => {
      const content =
        'This is plain content with no special patterns.\nJust regular text.';
      for (const key of nonClaudePlatforms) {
        expect(transformContent(content, configs[key])).toBe(content);
      }
    });
  });

  describe('blank line cleanup', () => {
    it('collapses three or more consecutive newlines to two', () => {
      const content = 'Line 1\n\n\n\n\nLine 2';
      const result = transformContent(content, configs.opencode);
      expect(result).toBe('Line 1\n\nLine 2');
    });

    it('collapses blank lines left after Liquid rendering', () => {
      const content = [
        'Before',
        '',
        '',
        '{%- if platform == "claude" %}',
        'Claude block',
        '{%- endif %}',
        '',
        '',
        'After',
      ].join('\n');
      const result = transformContent(content, configs.opencode);
      expect(result).not.toMatch(/\n{3,}/);
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });
  });

  describe('Claude Code replacement', () => {
    it('replaces "Claude Code" with "AI agent" for non-Claude platforms', () => {
      const content = 'Claude Code is a tool for development';
      for (const key of nonClaudePlatforms) {
        const result = transformContent(content, configs[key]);
        expect(result).toBe('AI agent is a tool for development');
        expect(result).not.toContain('Claude Code');
      }
    });

    it('preserves "Claude Code" for claude platform', () => {
      const content = 'Claude Code is a tool for development';
      expect(transformContent(content, configs.claude)).toBe(content);
    });

    it('replaces "Claude Code" after Liquid rendering', () => {
      const content = [
        '{%- if platform == "claude" %}',
        'Use Claude Code tasks.',
        '{%- else %}',
        'Claude Code can help here.',
        '{%- endif %}',
      ].join('\n');
      const result = transformContent(content, configs.opencode);
      expect(result).toContain('AI agent can help here.');
      expect(result).not.toContain('Claude Code');
    });
  });

  describe('MCP tool prefixes', () => {
    it('preserves mcp__plugin_nx_nx-mcp__ prefix unchanged', () => {
      const content = 'Use mcp__plugin_nx_nx-mcp__ci_information tool';
      const result = transformContent(content, configs.opencode);
      expect(result).toBe(content);
    });

    it('preserves mcp__nx-mcp__ prefix unchanged', () => {
      const content = 'Call mcp__nx-mcp__cloud_polygraph_init()';
      const result = transformContent(content, configs.opencode);
      expect(result).toBe(content);
    });
  });

  describe('error handling', () => {
    it('throws on malformed Liquid syntax', () => {
      const content = 'Some text {%- if %}broken{% endif %}';
      expect(() => transformContent(content, configs.claude)).toThrow(
        /Liquid template error/
      );
    });

    it('throws on unclosed if tag', () => {
      const content = '{%- if platform == "claude" %}\nUnclosed block';
      expect(() => transformContent(content, configs.claude)).toThrow(
        /Liquid template error/
      );
    });

    it('throws when platformKey is missing', () => {
      expect(() => transformContent('content', undefined)).toThrow(
        /platformKey is required/
      );
    });

    it('throws when platformKey is empty string', () => {
      expect(() => transformContent('content', '')).toThrow(
        /platformKey is required/
      );
    });
  });

  describe('unknown platform value', () => {
    it('falls through to else branch for unknown platform', () => {
      const content = [
        '{%- if platform == "claude" %}',
        'Claude branch',
        '{%- else %}',
        'Fallback branch',
        '{%- endif %}',
      ].join('\n');
      const result = transformContent(content, 'unknown-agent');
      expect(result).not.toContain('Claude branch');
      expect(result).toContain('Fallback branch');
    });
  });
});

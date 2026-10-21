import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  detectRelease,
  releaseVersion,
} from '../scripts/release-version.mjs';

describe('releaseVersion', () => {
  it.each([
    ['0.2.36', 'patch', '0.2.37'],
    ['0.2.36', 'minor', '0.3.0'],
    ['0.2.36', 'major', '1.0.0'],
    // Promoting the prereleases from next.
    ['0.3.0-next.4', 'patch', '0.3.0'],
    ['0.3.0-next.4', 'minor', '0.3.0'],
    ['0.3.0-next.4', 'major', '1.0.0'],
  ])('releases %s + %s as %s on main', (current, bump, expected) => {
    expect(releaseVersion(current, bump, 'main')).toBe(expected);
  });

  it.each([
    ['0.2.36', 'patch', '0.2.37-next.0'],
    ['0.2.36', 'minor', '0.3.0-next.0'],
    ['0.2.36', 'major', '1.0.0-next.0'],
    ['0.3.0-next.0', 'patch', '0.3.0-next.1'],
    ['0.3.0-next.0', 'minor', '0.3.0-next.1'],
    ['0.3.0-next.0', 'major', '1.0.0-next.0'],
    ['0.2.37-next.3', 'minor', '0.3.0-next.0'],
  ])('releases %s + %s as %s on next', (current, bump, expected) => {
    expect(releaseVersion(current, bump, 'next')).toBe(expected);
  });

  it('rejects other branches', () => {
    expect(() => releaseVersion('0.2.36', 'patch', 'feat/x')).toThrow(
      /main or next/
    );
  });
});

describe('compareVersions', () => {
  it.each([
    ['0.2.36', '0.2.37'],
    ['0.2.37-next.0', '0.2.37'],
    ['0.3.0-next.1', '0.3.0-next.2'],
    ['0.3.0-next.9', '0.3.0-next.10'],
    ['0.3.0-next.2', '0.3.1-next.0'],
  ])('orders %s before %s', (lower, higher) => {
    expect(compareVersions(lower, higher)).toBeLessThan(0);
    expect(compareVersions(higher, lower)).toBeGreaterThan(0);
  });
});

describe('detectRelease', () => {
  it('publishes prereleases from next under the next dist-tag', () => {
    expect(detectRelease('0.2.36', '0.3.0-next.0', 'next')).toBe('next');
    expect(detectRelease('0.3.0-next.0', '0.3.0-next.1', 'next')).toBe('next');
  });

  it('publishes stable versions from main under latest', () => {
    expect(detectRelease('0.3.0-next.4', '0.3.0', 'main')).toBe('latest');
  });

  it('skips unchanged and lower versions', () => {
    expect(detectRelease('0.3.0-next.1', '0.3.0-next.1', 'next')).toBeNull();
    expect(detectRelease('0.3.0-next.1', '0.3.0-next.0', 'next')).toBeNull();
  });

  it('refuses a version that belongs to the other channel', () => {
    expect(() => detectRelease('0.2.36', '0.3.0', 'next')).toThrow();
    expect(() => detectRelease('0.2.36', '0.3.0-next.0', 'main')).toThrow();
  });
});

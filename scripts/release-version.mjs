// Release channels: `main` publishes stable versions under the npm `latest`
// dist-tag, `next` publishes `X.Y.Z-next.N` prereleases under `next`. Each
// release also moves the `dist/<dist-tag>` branch, which Claude Code (the
// marketplace) and Cursor (the plugin itself) read from.
//
//   node scripts/release-version.mjs bump <patch|minor|major> --branch <branch>
//     prints the version the Release PR should set
//   node scripts/release-version.mjs detect <before> <after> --branch <branch>
//     prints the dist-tag to publish <after> under, or nothing when <after>
//     is not a newer release

export const CHANNELS = { main: 'latest', next: 'next' };
const PRERELEASE_ID = 'next';

export function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  if (!match) {
    throw new Error(`Invalid version: ${version}`);
  }
  const [, major, minor, patch, prerelease] = match;
  return {
    core: [Number(major), Number(minor), Number(patch)],
    prerelease: prerelease ? prerelease.split('.') : [],
  };
}

function channelFor(branch) {
  const distTag = CHANNELS[branch];
  if (!distTag) {
    throw new Error(
      `Releases are cut from ${Object.keys(CHANNELS).join(
        ' or '
      )}, not ${branch}`
    );
  }
  return distTag;
}

// Same as semver's `inc` for these types: a prerelease already counts as the
// release it leads up to, so `0.3.0-next.2` bumped by `minor` is `0.3.0`.
function bumpCore({ core: [major, minor, patch], prerelease }, bump) {
  const pre = prerelease.length > 0;
  if (bump === 'major') {
    return pre && minor === 0 && patch === 0
      ? [major, 0, 0]
      : [major + 1, 0, 0];
  }
  if (bump === 'minor') {
    return pre && patch === 0 ? [major, minor, 0] : [major, minor + 1, 0];
  }
  if (bump === 'patch') {
    return pre ? [major, minor, patch] : [major, minor, patch + 1];
  }
  throw new Error(`Unknown bump: ${bump}`);
}

export function releaseVersion(current, bump, branch) {
  const distTag = channelFor(branch);
  const parsed = parseVersion(current);
  const core = bumpCore(parsed, bump);
  if (distTag === 'latest') {
    return core.join('.');
  }
  const [id, n] = parsed.prerelease;
  const sameRelease = core.join('.') === parsed.core.join('.');
  const number = sameRelease && id === PRERELEASE_ID ? Number(n) + 1 : 0;
  return `${core.join('.')}-${PRERELEASE_ID}.${number}`;
}

function compareIdentifiers(a, b) {
  const [numA, numB] = [/^\d+$/.test(a), /^\d+$/.test(b)];
  if (numA && numB) return Number(a) - Number(b);
  if (numA !== numB) return numA ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareVersions(a, b) {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i++) {
    if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  }
  if (!x.prerelease.length || !y.prerelease.length) {
    return y.prerelease.length - x.prerelease.length;
  }
  for (let i = 0; i < Math.max(x.prerelease.length, y.prerelease.length); i++) {
    if (x.prerelease[i] === undefined) return -1;
    if (y.prerelease[i] === undefined) return 1;
    const order = compareIdentifiers(x.prerelease[i], y.prerelease[i]);
    if (order !== 0) return order;
  }
  return 0;
}

/**
 * The dist-tag to publish `after` under when it is a newer release than
 * `before`, or `null`. Publishing only on an increase means a revert never
 * republishes.
 */
export function detectRelease(before, after, branch) {
  const distTag = channelFor(branch);
  if (compareVersions(after, before) <= 0) {
    return null;
  }
  const isNext = parseVersion(after).prerelease[0] === PRERELEASE_ID;
  if (isNext !== (distTag === 'next')) {
    throw new Error(
      `${after} cannot be released from ${branch}: ${branch} releases ${
        distTag === 'next'
          ? `X.Y.Z-${PRERELEASE_ID}.N versions`
          : 'stable versions'
      }`
    );
  }
  return distTag;
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const [command, ...rest] = process.argv.slice(2);
  const branchFlag = rest.indexOf('--branch');
  const branch = branchFlag === -1 ? undefined : rest[branchFlag + 1];
  const args = branchFlag === -1 ? rest : rest.slice(0, branchFlag);
  try {
    if (command === 'bump') {
      const { readPluginManifest } = await import('./package-plugins.mjs');
      console.log(
        releaseVersion(readPluginManifest().version, args[0], branch)
      );
    } else if (command === 'detect') {
      console.log(detectRelease(args[0], args[1], branch) ?? '');
    } else {
      throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { generateNotes } from '@semantic-release/release-notes-generator';
import { gitmojis } from 'gitmojis';

import sharedConfig, { normalizeGitmoji, parserOpts, releaseRules, writerOpts } from '../index.mjs';
import selfReleaseConfig from '../release.config.mjs';

const silentLogger = {
  error() {},
  log() {},
  success() {},
};

function commit(message, index = 0) {
  return {
    hash: String(index + 1).padStart(40, '0'),
    message,
  };
}

async function analyze(messages) {
  return analyzeCommits(
    {
      parserOpts,
      releaseRules,
    },
    {
      commits: messages.map(commit),
      logger: silentLogger,
    },
  );
}

async function generate(messages) {
  return generateNotes(
    {
      parserOpts,
      writerOpts,
    },
    {
      commits: messages.map(commit),
      host: 'https://github.com',
      lastRelease: {
        gitTag: 'v1.0.0',
        version: '1.0.0',
      },
      logger: silentLogger,
      nextRelease: {
        gitTag: 'v1.0.1',
        type: 'patch',
        version: '1.0.1',
      },
      options: {
        repositoryUrl: 'https://github.com/teopartesi/example.git',
      },
      owner: 'teopartesi',
      repoUrl: 'https://github.com/teopartesi/example',
      repository: 'example',
    },
  );
}

function pluginName(plugin) {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

test('every official Gitmoji works as Unicode and shortcode', async (t) => {
  assert.ok(gitmojis.length > 0);

  for (const gitmoji of gitmojis) {
    await t.test(gitmoji.code, async () => {
      const expectedRelease = gitmoji.semver ?? 'patch';

      assert.equal(
        await analyze([`${gitmoji.emoji} Test ${gitmoji.code} as Unicode`]),
        expectedRelease,
      );
      assert.equal(
        await analyze([`${gitmoji.code} Test ${gitmoji.code} as shortcode`]),
        expectedRelease,
      );
    });
  }
});

test('normalizes optional Unicode variation selectors', async () => {
  const gitmoji = gitmojis.find(({ emoji }) => normalizeGitmoji(emoji) !== emoji);

  assert.ok(gitmoji, 'The Gitmoji catalog should contain an emoji with a variation selector');
  assert.equal(await analyze([`${gitmoji.emoji} Keep the selector`]), gitmoji.semver ?? 'patch');
  assert.equal(
    await analyze([`${normalizeGitmoji(gitmoji.emoji)} Remove the selector`]),
    gitmoji.semver ?? 'patch',
  );
});

test('supports scopes, optional Gitmoji colons, and Conventional Commits', async () => {
  assert.equal(await analyze(['🐛 (parser): Fix scoped parsing']), 'patch');
  assert.equal(await analyze([':lipstick: (ui) Restyle the button']), 'patch');
  assert.equal(await analyze(['feat(api): Add an endpoint']), 'minor');
  assert.equal(await analyze(['fix: Correct the response']), 'patch');
  assert.equal(await analyze(['perf(core): Reduce allocations']), 'patch');
});

test('uses the leading type for hybrid commit messages', async () => {
  assert.equal(await analyze(['💄 feat: Restyle the page']), 'patch');
  assert.equal(await analyze(['fix: ✨ Add a guarded feature']), 'patch');
});

test('recognizes every supported breaking-change syntax', async () => {
  assert.equal(await analyze(['feat!: Remove the legacy API']), 'major');
  assert.equal(
    await analyze(['🐛 Fix compatibility\n\nBREAKING CHANGE: Drop Node.js 20']),
    'major',
  );
  assert.equal(
    await analyze(['fix: Change behavior\n\nBREAKING CHANGES: Remove old defaults']),
    'major',
  );
  assert.equal(await analyze(['💥 Remove the legacy API']), 'major');
});

test('uses patch releases for Gitmojis without an official SemVer value', async () => {
  const gitmoji = gitmojis.find(({ semver }) => semver == null);

  assert.ok(gitmoji, 'The Gitmoji catalog should contain an entry without a SemVer value');
  assert.equal(await analyze([`${gitmoji.code} Apply a maintenance change`]), 'patch');
});

test('ignores merge and unknown commit messages', async () => {
  assert.equal(await analyze(['Merge pull request #12 from teopartesi/example']), null);
  assert.equal(await analyze(['This is not a supported commit']), null);
});

test('groups release notes by Gitmoji intention and excludes merges', async () => {
  const deploy = gitmojis.find(({ code }) => code === ':rocket:');
  const greenHeart = gitmojis.find(({ code }) => code === ':green_heart:');

  assert.ok(deploy);
  assert.ok(greenHeart);

  const notes = await generate([
    '🚀 Deploy the application',
    ':green_heart: Fix the release workflow',
    'Merge pull request #12 from teopartesi/example',
  ]);

  assert.match(notes, new RegExp(`## .* ${deploy.description.replace(/\.$/u, '')}`, 'u'));
  assert.match(notes, new RegExp(`## .* ${greenHeart.description.replace(/\.$/u, '')}`, 'u'));
  assert.match(notes, /Deploy the application/u);
  assert.match(notes, /Fix the release workflow/u);
  assert.doesNotMatch(notes, /Merge pull request/u);
});

test('exports a consumer-safe preset and a separate self-release configuration', () => {
  const sharedPlugins = sharedConfig.plugins.map(pluginName);
  const selfPlugins = selfReleaseConfig.plugins.map(pluginName);
  const npmPluginIndex = selfPlugins.indexOf('@semantic-release/npm');
  const gitPluginIndex = selfPlugins.indexOf('@semantic-release/git');

  assert.equal(sharedConfig.branches, undefined);
  assert.equal(sharedConfig.tagFormat, undefined);
  assert.deepEqual(selfReleaseConfig.branches, ['main']);
  assert.equal(selfReleaseConfig.tagFormat, 'v${version}');
  assert.ok(sharedPlugins.includes('@semantic-release/changelog'));
  assert.ok(sharedPlugins.includes('@semantic-release/github'));
  assert.equal(sharedPlugins.includes('@semantic-release/npm'), false);

  assert.ok(npmPluginIndex >= 0);
  assert.equal(npmPluginIndex + 1, gitPluginIndex);

  const gitPlugin = selfReleaseConfig.plugins[gitPluginIndex];
  assert.ok(Array.isArray(gitPlugin));
  assert.deepEqual(gitPlugin[1].assets, ['CHANGELOG.md', 'package.json', 'package-lock.json']);
});

test('publishes only the public preset with its runtime dependencies', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const requiredDependencies = [
    '@semantic-release/changelog',
    '@semantic-release/commit-analyzer',
    '@semantic-release/git',
    '@semantic-release/github',
    '@semantic-release/release-notes-generator',
    'gitmojis',
  ];

  assert.equal(packageJson.private, undefined);
  assert.equal(packageJson.type, 'module');
  assert.equal(packageJson.main, './index.mjs');
  assert.equal(packageJson.exports['.'], './index.mjs');
  assert.deepEqual(packageJson.files, ['index.mjs']);
  assert.equal(packageJson.peerDependencies['semantic-release'], '^25.0.0');

  for (const dependency of requiredDependencies) {
    assert.ok(packageJson.dependencies[dependency], `${dependency} must be a runtime dependency`);
  }
});

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

async function generate(messages, contextOverrides = {}) {
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
      ...contextOverrides,
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
  const notes = await generate([
    'Merge pull request #12 from teopartesi/example',
    'Bump publint from 0.3.24 to 0.3.25',
    'custom: An unsupported commit type',
  ]);
  assert.doesNotMatch(notes, /Merge pull request|Bump publint|unsupported commit/u);
  assert.doesNotMatch(notes, /^### /mu);
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

test('retains every official Gitmoji section in release notes', async () => {
  const notes = await generate(gitmojis.map(({ code }, index) => `${code} Change number ${index}`));

  for (const [index, { emoji, description }] of gitmojis.entries()) {
    assert.ok(notes.includes(`### ${emoji} ${description.replace(/\.$/u, '')}\n`));
    assert.ok(notes.includes(`Change number ${index} (`));
  }
});

test('adds emojis to every supported Conventional Commit section', async () => {
  const notes = await generate([
    'build: Update the build system',
    'chore: Clean up tooling',
    'ci: Fix the CI pipeline',
    'docs: Document the API',
    'feat: Add an endpoint',
    'fix: Fix a bug',
    'perf: Reduce allocations',
    'refactor: Simplify the parser',
    'revert: Restore previous behavior',
    'style: Format the source',
    'test: Add coverage',
  ]);

  assert.deepEqual(
    [...notes.matchAll(/^### (.+)$/gmu)].map(([, title]) => title),
    [
      '🐛 Bug Fixes',
      '🏗️ Build System',
      '🔧 Chores',
      '♻️ Code Refactoring',
      '💚 Continuous Integration',
      '📝 Documentation',
      '✨ Features',
      '⚡️ Performance Improvements',
      '⏪️ Reverts',
      '🎨 Styles',
      '✅ Tests',
    ],
  );
});

test('decorates known scopes without changing unknown, decorated, or wildcard scopes', async () => {
  const notes = await generate([
    'fix(API): Preserve uppercase scope spelling',
    '🐛 (deps-dev): Update development dependencies',
    'fix(workflow): Repair CI',
    'fix(readme): Correct documentation',
    'fix(ui): Align the button',
    'fix(parser): Handle a custom scope',
    'fix(🌐 api): Preserve an existing emoji',
    'fix(*): Apply a global fix',
    'fix: Handle a missing scope',
  ]);

  assert.ok(notes.includes('**🌐 API:** Preserve uppercase scope spelling'));
  assert.ok(notes.includes('**📦 deps-dev:** Update development dependencies'));
  assert.ok(notes.includes('**💚 workflow:** Repair CI'));
  assert.ok(notes.includes('**📝 readme:** Correct documentation'));
  assert.ok(notes.includes('**💄 ui:** Align the button'));
  assert.ok(notes.includes('**parser:** Handle a custom scope'));
  assert.ok(notes.includes('**🌐 api:** Preserve an existing emoji'));
  assert.ok(notes.includes('* Apply a global fix'));
  assert.ok(notes.includes('* Handle a missing scope'));
  assert.doesNotMatch(notes, /🌐 🌐|\*\*\*:/u);
  assert.equal(await analyze(['fix(🌐 api): Preserve an existing emoji']), 'patch');
});

test('sorts mixed Gitmoji sections by label and commits by original scope and subject', async () => {
  const notes = await generate([
    'fix(zeta): An unknown scope',
    'feat: Add a feature',
    'fix(core): A core fix',
    'fix(api): Z endpoint fix',
    '🚀 Deploy a release',
    'fix(api): A endpoint fix',
  ]);

  assert.deepEqual(
    [...notes.matchAll(/^### (.+)$/gmu)].map(([, title]) => title),
    ['🐛 Bug Fixes', '🚀 Deploy stuff', '✨ Features'],
  );
  const subjects = ['A endpoint fix', 'Z endpoint fix', 'A core fix', 'An unknown scope'];
  const positions = subjects.map((subject) => notes.indexOf(subject));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(
    positions,
    [...positions].sort((left, right) => left - right),
  );
});

test('highlights breaking changes before ordinary sections and preserves their scopes', async () => {
  const notes = await generate([
    'fix(config)!: Remove the legacy option\n\nBREAKING CHANGE: Use the new option.',
    'feat(api): Replace the endpoint\n\nBREAKING CHANGES: Migrate to /v2.',
  ]);

  assert.match(notes, /^## 🔖 .+\n\n### 💥 BREAKING CHANGES\n/u);
  assert.ok(notes.includes('**⚙️ config:** Use the new option.'));
  assert.ok(notes.includes('**🌐 api:** Migrate to /v2.'));
  assert.equal(notes.match(/^### 💥 BREAKING CHANGES$/gmu).length, 1);
  assert.doesNotMatch(notes, /\n{3,}/u);
});

test('filters automatic release entries while retaining manual release maintenance', async () => {
  const notes = await generate([
    'chore(release): 1.2.3 [skip ci]\n\nBREAKING CHANGE: Previous release notes.',
    'chore(release): 🔖 2.0.0-rc.1+build.42 [skip ci]',
    'chore(release): Recover incomplete 1.1.0 release',
    'chore(release): Prepare 1.3.0 [skip ci]',
    'chore(release): 1.4.0',
    'chore(ci): 1.5.0 [skip ci]',
    '🔖 Tag the first public release',
  ]);

  assert.doesNotMatch(notes, /1\.2\.3|2\.0\.0-rc\.1|Previous release notes|BREAKING CHANGES/u);
  assert.ok(notes.includes('**🔖 release:** Recover incomplete 1.1.0 release'));
  assert.ok(notes.includes('**🔖 release:** Prepare 1.3.0 [skip ci]'));
  assert.ok(notes.includes('**🔖 release:** 1.4.0'));
  assert.ok(notes.includes('**💚 ci:** 1.5.0 [skip ci]'));
  assert.ok(notes.includes('Tag the first public release'));
  assert.equal(await analyze(['chore(release): 🔖 1.2.3 [skip ci]']), null);
});

test('preserves comparison, commit, issue, and mention links without duplicate references', async () => {
  const notes = await generate([
    'fix(api): Fix #42 with @teopartesi and `@literal`\n\nCloses #42, #43',
  ]);

  assert.ok(
    notes.includes('[1.0.1](https://github.com/teopartesi/example/compare/v1.0.0...v1.0.1)'),
  );
  assert.ok(notes.includes('[0000000](https://github.com/teopartesi/example/commit/'));
  assert.ok(notes.includes('[#42](https://github.com/teopartesi/example/issues/42)'));
  assert.equal(notes.match(/\/issues\/42\)/gu).length, 1);
  assert.ok(notes.includes('[#43](https://github.com/teopartesi/example/issues/43)'));
  assert.ok(notes.includes('[@teopartesi](https://github.com/teopartesi)'));
  assert.ok(notes.includes('`@literal`'));
});

test('renders native Git revert messages even when they have no parsed subject', async () => {
  const notes = await generate([
    `Revert "An earlier feature"\n\nThis reverts commit ${'a'.repeat(40)}.`,
    `Revert "Another earlier feature"\n\nThis reverts commit ${'b'.repeat(40)}.`,
  ]);

  assert.ok(notes.includes('### ⏪️ Reverts'));
  assert.ok(notes.includes('Revert "An earlier feature"'));
  assert.ok(notes.includes('Revert "Another earlier feature"'));
});

test('uses consistent version headings and spacing for every release level and the first release', async () => {
  for (const [type, version] of [
    ['patch', '1.0.1'],
    ['minor', '1.1.0'],
    ['major', '2.0.0'],
  ]) {
    const notes = await generate(['fix: Correct behavior', 'docs: Document behavior'], {
      nextRelease: { gitTag: `v${version}`, type, version },
    });
    assert.ok(notes.startsWith(`## 🔖 [${version}](`));
    assert.match(notes, /\(\d{4}-\d{2}-\d{2}\)\n\n### 🐛 Bug Fixes\n\n/u);
    assert.ok(notes.includes('\n\n### 📝 Documentation\n\n'));
    assert.doesNotMatch(notes, /\n{3,}|BREAKING CHANGES/u);
  }

  const notes = await generate(['feat: Start the project'], {
    lastRelease: {},
    nextRelease: { gitTag: 'v1.0.0', type: 'minor', version: '1.0.0' },
  });
  assert.match(notes, /^## 🔖 1\.0\.0 \(\d{4}-\d{2}-\d{2}\)/u);
  assert.doesNotMatch(notes, /\/compare\//u);
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
  const sharedGitPlugin = sharedConfig.plugins.find(
    (plugin) => pluginName(plugin) === '@semantic-release/git',
  );
  assert.ok(Array.isArray(gitPlugin));
  assert.deepEqual(gitPlugin[1].assets, ['CHANGELOG.md', 'package.json', 'package-lock.json']);
  assert.equal(gitPlugin[1].message, sharedGitPlugin[1].message);
  assert.equal(
    gitPlugin[1].message,
    'chore(release): 🔖 ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
  );
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

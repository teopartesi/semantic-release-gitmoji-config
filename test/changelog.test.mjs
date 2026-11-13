import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { generateNotes } from '@semantic-release/release-notes-generator';
import { prepare } from '@semantic-release/changelog';

import sharedConfig, { parserOpts, releaseRules, writerOpts } from '../index.mjs';

const execFileAsync = promisify(execFile);
const getCommitsUrl = new URL('lib/get-commits.js', import.meta.resolve('semantic-release'));
const { default: getCommits } = await import(getCommitsUrl);
const logger = { log() {}, error() {}, success() {} };

test('includes merged develop commits and prepends future releases without rewriting history', async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'gitmoji-changelog-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Preset Test',
    GIT_AUTHOR_EMAIL: 'preset@example.com',
    GIT_COMMITTER_NAME: 'Preset Test',
    GIT_COMMITTER_EMAIL: 'preset@example.com',
  };
  async function git(...args) {
    const { stdout } = await execFileAsync(
      'git',
      ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args],
      { cwd, env },
    );
    return stdout.trim();
  }

  await git('init', '--initial-branch=main');
  await git('commit', '--allow-empty', '-m', 'feat: Previously released feature');
  const gitHead = await git('rev-parse', 'HEAD');
  await git('tag', 'v1.0.0');
  await git('checkout', '-b', 'develop');

  const branchMessages = [
    '✨ (api): Add a new endpoint',
    ':bug: (core): Fix response parsing',
    'docs(readme): Document the endpoint',
    'Bump publint from 0.3.24 to 0.3.25',
  ];
  for (const message of branchMessages) {
    await git('commit', '--allow-empty', '-m', message);
  }

  await git('checkout', 'main');
  const mainMessage = 'fix(config): Correct the default option';
  await git('commit', '--allow-empty', '-m', mainMessage);
  const mergeMessage = 'Merge pull request #2 from teopartesi/develop';
  await git('merge', '--no-ff', 'develop', '-m', mergeMessage);

  const lastRelease = { gitHead, gitTag: 'v1.0.0', version: '1.0.0' };
  const commits = await getCommits({ cwd, env, lastRelease, logger });
  assert.deepEqual(
    commits.map(({ message }) => message.trim()).sort(),
    [...branchMessages, mainMessage, mergeMessage].sort(),
  );
  assert.equal(await analyzeCommits({ parserOpts, releaseRules }, { commits, logger }), 'minor');

  const context = {
    cwd,
    commits,
    lastRelease,
    logger,
    nextRelease: { gitTag: 'v1.1.0', type: 'minor', version: '1.1.0' },
    options: { repositoryUrl: 'https://github.com/teopartesi/example.git' },
  };
  const notes = await generateNotes({ parserOpts, writerOpts }, context);
  for (const subject of [
    'Add a new endpoint',
    'Fix response parsing',
    'Document the endpoint',
    'Correct the default option',
  ]) {
    assert.equal(notes.split(subject).length - 1, 1);
  }
  assert.doesNotMatch(notes, /Previously released|Merge pull request|Bump publint/u);
  assert.ok(notes.includes('**🌐 api:**'));
  assert.ok(notes.includes('**⚙️ core:**'));
  assert.ok(notes.includes('**📝 readme:**'));
  assert.ok(notes.includes('/compare/v1.0.0...v1.1.0'));

  const legacy = '# 1.0.0 (2026-09-24)\n\n\n### Features\n\n* Legacy entry\n';
  const changelogPath = path.join(cwd, 'CHANGELOG.md');
  await writeFile(changelogPath, legacy);
  const [, changelogOptions] = sharedConfig.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === '@semantic-release/changelog',
  );
  await prepare(changelogOptions, { ...context, nextRelease: { notes } });
  const firstChangelog = await readFile(changelogPath, 'utf8');
  assert.equal(firstChangelog, `# 📝 Changelog\n\n${notes.trim()}\n\n${legacy}`);

  const nextNotes = await generateNotes(
    { parserOpts, writerOpts },
    {
      ...context,
      commits: [{ hash: 'a'.repeat(40), message: 'fix(api): Handle an empty response' }],
      lastRelease: context.nextRelease,
      nextRelease: { gitTag: 'v1.1.1', type: 'patch', version: '1.1.1' },
    },
  );
  await prepare(changelogOptions, { ...context, nextRelease: { notes: nextNotes } });
  const secondChangelog = await readFile(changelogPath, 'utf8');
  assert.equal(secondChangelog.match(/^# 📝 Changelog$/gmu).length, 1);
  assert.ok(secondChangelog.startsWith('# 📝 Changelog\n\n## 🔖 [1.1.1]'));
  assert.ok(secondChangelog.endsWith(`${notes.trim()}\n\n${legacy}`));
});

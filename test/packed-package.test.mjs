import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

const silentLogger = {
  error() {},
  log() {},
  success() {},
};

test('the packed preset loads through semantic-release extends', async (t) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'semantic-release-gitmoji-config-'));
  const packageDirectory = path.join(temporaryRoot, 'package');
  const consumerDirectory = path.join(temporaryRoot, 'consumer');

  t.after(async () => {
    await rm(temporaryRoot, { force: true, recursive: true });
  });

  await Promise.all([
    mkdir(packageDirectory, { recursive: true }),
    mkdir(consumerDirectory, { recursive: true }),
  ]);

  const { stdout: packOutput } = await execFileAsync(
    'npm',
    ['pack', '--json', '--pack-destination', packageDirectory],
    {
      cwd: repositoryRoot,
    },
  );
  const [{ filename, files }] = JSON.parse(packOutput);
  const publishedPaths = files.map(({ path: publishedPath }) => publishedPath).sort();

  assert.deepEqual(publishedPaths, ['LICENSE', 'README.md', 'index.mjs', 'package.json']);

  const tarballPath = path.join(packageDirectory, filename);
  const consumerPackageJson = {
    name: 'preset-consumer',
    private: true,
    type: 'module',
    repository: 'https://github.com/teopartesi/example.git',
    dependencies: {
      'semantic-release': '25.0.9',
      'semantic-release-gitmoji-config': `file:${tarballPath}`,
    },
  };

  await writeFile(
    path.join(consumerDirectory, 'package.json'),
    `${JSON.stringify(consumerPackageJson, null, 2)}\n`,
    'utf8',
  );
  await execFileAsync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'],
    {
      cwd: consumerDirectory,
    },
  );

  const semanticReleaseDirectory = path.join(consumerDirectory, 'node_modules', 'semantic-release');
  const getConfigUrl = pathToFileURL(
    path.join(semanticReleaseDirectory, 'lib', 'get-config.js'),
  ).href;
  const getConfig = (await import(getConfigUrl)).default;
  const { options, plugins } = await getConfig(
    {
      cwd: consumerDirectory,
      env: process.env,
      logger: silentLogger,
    },
    {
      extends: ['semantic-release-gitmoji-config'],
    },
  );

  assert.ok(options.branches.includes('main'));
  assert.ok(options.branches.includes('master'));
  assert.equal(options.tagFormat, 'v${version}');
  assert.equal(typeof plugins.analyzeCommits, 'function');
  assert.equal(typeof plugins.generateNotes, 'function');
  assert.equal(typeof plugins.prepare, 'function');
  assert.equal(typeof plugins.publish, 'function');

  const installedPackageJson = JSON.parse(
    await readFile(
      path.join(
        consumerDirectory,
        'node_modules',
        'semantic-release-gitmoji-config',
        'package.json',
      ),
      'utf8',
    ),
  );
  assert.equal(installedPackageJson.name, 'semantic-release-gitmoji-config');
});

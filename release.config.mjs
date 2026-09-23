import sharedConfig from './index.mjs';

const selfReleasePlugins = sharedConfig.plugins.flatMap((plugin) => {
  const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;

  if (pluginName !== '@semantic-release/git') {
    return [plugin];
  }

  return [
    '@semantic-release/npm',
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json', 'package-lock.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ];
});

export default {
  ...sharedConfig,
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: selfReleasePlugins,
};

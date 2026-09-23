import { gitmojis } from 'gitmojis';

const VARIATION_SELECTORS_PATTERN = /[\uFE0E\uFE0F]/gu;
const DEFAULT_GITMOJI_RELEASE = 'patch';

export function normalizeGitmoji(value) {
	return value.replace(VARIATION_SELECTORS_PATTERN, '');
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function getGitmojiTypes(gitmoji) {
	return [...new Set([gitmoji.emoji, normalizeGitmoji(gitmoji.emoji), gitmoji.code])];
}

const gitmojiTypes = gitmojis
	.flatMap(getGitmojiTypes)
	.sort((left, right) => right.length - left.length);
const gitmojiPattern = `(?:${gitmojiTypes.map(escapeRegExp).join('|')})`;
const conventionalTypePattern = '[a-z][a-z0-9-]*(?=(?:\\s*\\([^)]+\\))?!?:)';
const headerTypePattern = `(${gitmojiPattern}|${conventionalTypePattern})`;

export const parserOpts = {
	headerPattern: new RegExp(`^${headerTypePattern}(?:\\s*\\(([^)]+)\\))?!?:?\\s+(.+)$`, 'u'),
	breakingHeaderPattern: new RegExp(
		`^${headerTypePattern}(?:\\s*\\(([^)]+)\\))?!:\\s+(.+)$`,
		'u',
	),
	headerCorrespondence: ['type', 'scope', 'subject'],
	noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES', 'BREAKING-CHANGE', 'BREAKING-CHANGES'],
};

export const releaseRules = [
	{ breaking: true, release: 'major' },
	...gitmojis.flatMap((gitmoji) =>
		getGitmojiTypes(gitmoji).map((type) => ({
			type,
			release: gitmoji.semver ?? DEFAULT_GITMOJI_RELEASE,
		})),
	),
];

const gitmojiByType = new Map(
	gitmojis.flatMap((gitmoji) =>
		getGitmojiTypes(gitmoji).map((type) => [normalizeGitmoji(type), gitmoji]),
	),
);

const conventionalSections = new Map([
	['build', 'Build System'],
	['chore', 'Chores'],
	['ci', 'Continuous Integration'],
	['docs', 'Documentation'],
	['feat', 'Features'],
	['fix', 'Bug Fixes'],
	['perf', 'Performance Improvements'],
	['refactor', 'Code Refactoring'],
	['revert', 'Reverts'],
	['style', 'Styles'],
	['test', 'Tests'],
]);

function getReleaseNoteSection(commit) {
	const gitmoji = commit.type ? gitmojiByType.get(normalizeGitmoji(commit.type)) : undefined;

	if (gitmoji) {
		return `${gitmoji.emoji} ${gitmoji.description.replace(/\.$/u, '')}`;
	}

	if (commit.revert) {
		return 'Reverts';
	}

	return conventionalSections.get(commit.type);
}

export function transformCommit(commit, context) {
	const type = getReleaseNoteSection(commit);

	if (!type) {
		return undefined;
	}

	const notes = commit.notes.map((note) => ({
		...note,
		title: 'BREAKING CHANGES',
	}));
	const scope = commit.scope === '*' ? '' : commit.scope;
	const shortHash =
		typeof commit.hash === 'string' ? commit.hash.substring(0, 7) : commit.shortHash;
	const issues = [];
	let { subject } = commit;

	if (typeof subject === 'string') {
		let repositoryUrl = context.repository
			? `${context.host}/${context.owner}/${context.repository}`
			: context.repoUrl;

		if (repositoryUrl) {
			repositoryUrl = `${repositoryUrl}/issues/`;
			subject = subject.replace(/#([0-9]+)/gu, (_, issue) => {
				issues.push(issue);
				return `[#${issue}](${repositoryUrl}${issue})`;
			});
		}

		if (context.host) {
			subject = subject.replace(
				/`[^`]*`|\B@([a-z0-9](?:-?[a-z0-9/]){0,38})/gu,
				(match, username) => {
					if (!username) {
						return match;
					}

					return username.includes('/')
						? `@${username}`
						: `[@${username}](${context.host}/${username})`;
				},
			);
		}
	}

	const references = commit.references.filter((reference) => !issues.includes(reference.issue));

	return {
		notes,
		references,
		scope,
		shortHash,
		subject,
		type,
	};
}

export const writerOpts = {
	transform: transformCommit,
};

const releaseConfig = {
	branches: ['main'],
	tagFormat: 'v${version}',
	plugins: [
		[
			'@semantic-release/commit-analyzer',
			{
				parserOpts,
				releaseRules,
			},
		],
		[
			'@semantic-release/release-notes-generator',
			{
				parserOpts,
				writerOpts,
			},
		],
		[
			'@semantic-release/changelog',
			{
				changelogFile: 'CHANGELOG.md',
			},
		],
		[
			'@semantic-release/git',
			{
				assets: ['CHANGELOG.md'],
				message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
			},
		],
		'@semantic-release/github',
	],
};

export default releaseConfig;

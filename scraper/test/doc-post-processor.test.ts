import { assert, describe, it } from '@effect/vitest';

import { Effect, Path } from 'effect';

import { rewriteKnownDocLinksInMarkdown } from '../doc-post-processor.ts';
import { UrlPrefixReplacement, WrittenDocument } from '../model.ts';

const source = new WrittenDocument({
	url: 'https://ent.dev/docs/loaders/loader',
	path: 'docs/deps/ent-ts/loaders/loader.md',
	strategy: 'DefuddleStrategy'
});

const documents = [
	source,
	new WrittenDocument({
		url: 'https://ent.dev/docs/core-concepts/context-caching',
		path: 'docs/deps/ent-ts/core-concepts/context-caching.md',
		strategy: 'DefuddleStrategy'
	}),
	new WrittenDocument({
		url: 'https://ent.dev/docs/custom-data-access/custom-queries',
		path: 'docs/deps/ent-ts/custom-data-access/custom-queries.md',
		strategy: 'DefuddleStrategy'
	})
];

describe('rewriteKnownDocLinksInMarkdown', () => {
	it.effect('rewrites known docset web links to relative markdown paths', () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const input = [
				'---',
				'url: https://ent.dev/docs/loaders/loader',
				'---',
				'',
				'Uses [context cache](https://ent.dev/docs/core-concepts/context-caching).',
				'Read [custom queries](https://ent.dev/docs/custom-data-access/custom-queries#examples).',
				'External [DataLoader](https://github.com/graphql/dataloader) stays web.'
			].join('\n');

			const output = rewriteKnownDocLinksInMarkdown(
				path,
				documents,
				source,
				input
			);

			assert.strictEqual(
				output,
				[
					'---',
					'url: https://ent.dev/docs/loaders/loader',
					'---',
					'',
					'Uses [context cache](../core-concepts/context-caching.md).',
					'Read [custom queries](../custom-data-access/custom-queries.md#examples).',
					'External [DataLoader](https://github.com/graphql/dataloader) stays web.'
				].join('\n')
			);
		}).pipe(Effect.provide(Path.layer)));

	it.effect('matches known doc URLs with trailing slashes', () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const output = rewriteKnownDocLinksInMarkdown(
				path,
				documents,
				source,
				'[context cache](https://ent.dev/docs/core-concepts/context-caching/)'
			);

			assert.strictEqual(
				output,
				'[context cache](../core-concepts/context-caching.md)'
			);
		}).pipe(Effect.provide(Path.layer)));

	it.effect('matches known doc URLs across www redirects', () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const electronSource = new WrittenDocument({
				url: 'https://electronjs.org/docs/latest/tutorial/tutorial-first-app',
				path: 'docs/deps/electron/tutorial/tutorial-first-app.md',
				strategy: 'DefuddleStrategy'
			});
			const output = rewriteKnownDocLinksInMarkdown(
				path,
				[
					electronSource,
					new WrittenDocument({
						url: 'https://electronjs.org/docs/latest/api/browser-window',
						path: 'docs/deps/electron/api/browser-window.md',
						strategy: 'DefuddleStrategy'
					})
				],
				electronSource,
				'[BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window).'
			);

			assert.strictEqual(
				output,
				'[BrowserWindow](../api/browser-window.md).'
			);
		}).pipe(Effect.provide(Path.layer)));

	it.effect('rewrites root-relative doc links without prefix collisions', () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const rootSource = new WrittenDocument({
				url: 'https://raw.githubusercontent.com/LadybugDB/ladybug-docs/main/src/content/docs/get-started/cypher-intro.mdx',
				path: 'docs/deps/ladybugdb/get-started/cypher-intro.md',
				strategy: 'DirectUrlStrategy'
			});
			const rootDocuments = [
				rootSource,
				new WrittenDocument({
					url: 'https://raw.githubusercontent.com/LadybugDB/ladybug-docs/main/src/content/docs/cypher/index.mdx',
					path: 'docs/deps/ladybugdb/cypher/index.md',
					strategy: 'DirectUrlStrategy'
				}),
				new WrittenDocument({
					url: 'https://raw.githubusercontent.com/LadybugDB/ladybug-docs/main/src/content/docs/tutorials/cypher/index.mdx',
					path: 'docs/deps/ladybugdb/tutorials/cypher/index.md',
					strategy: 'DirectUrlStrategy'
				})
			];

			const output = rewriteKnownDocLinksInMarkdown(
				path,
				rootDocuments,
				rootSource,
				'[Cypher manual](/cypher) and [Cypher tutorial](/tutorials/cypher).',
				'docs/deps/ladybugdb'
			);

			assert.strictEqual(
				output,
				'[Cypher manual](../cypher/index.md) and [Cypher tutorial](../tutorials/cypher/index.md).'
			);
		}).pipe(Effect.provide(Path.layer)));

	it.effect('rewrites overlapping absolute URLs atomically', () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const menu = new WrittenDocument({
				url: 'https://electronjs.org/docs/latest/api/menu',
				path: 'docs/deps/electron/api/menu.md',
				strategy: 'DefuddleStrategy'
			});
			const menuItem = new WrittenDocument({
				url: 'https://electronjs.org/docs/latest/api/menu-item',
				path: 'docs/deps/electron/api/menu-item.md',
				strategy: 'DefuddleStrategy'
			});

			assert.strictEqual(
				rewriteKnownDocLinksInMarkdown(
					path,
					[menu, menuItem],
					menu,
					'[Menu](https://electronjs.org/docs/latest/api/menu) and [MenuItem](https://electronjs.org/docs/latest/api/menu-item)'
				),
				'[Menu](menu.md) and [MenuItem](menu-item.md)'
			);
		}).pipe(Effect.provide(Path.layer)));

	it.effect('maps /docs URLs independently of output path aliases', () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const storybook = new WrittenDocument({
				url: 'https://turborepo.dev/docs/guides/tools/storybook',
				path: 'docs/deps/turborepo/guides/tools/storybook.md',
				strategy: 'DefuddleStrategy'
			});
			const installation = new WrittenDocument({
				url: 'https://turborepo.dev/docs/getting-started/installation',
				path: 'docs/deps/turborepo/getting-started/installation.md',
				strategy: 'DefuddleStrategy'
			});

			assert.strictEqual(
				rewriteKnownDocLinksInMarkdown(
					path,
					[storybook, installation],
					storybook,
					'[Install](/docs/getting-started/installation) and [Missing](/docs/missing)',
					'docs/deps/turborepo'
				),
				'[Install](../../getting-started/installation.md) and [Missing](https://turborepo.dev/docs/missing)'
			);
		}).pipe(Effect.provide(Path.layer)));

	it.effect('resolves configured same-site URL aliases', () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const storybook = new WrittenDocument({
				url: 'https://turborepo.dev/docs/guides/tools/storybook',
				path: 'docs/deps/turborepo/guides/tools/storybook.md',
				strategy: 'DefuddleStrategy'
			});
			const installation = new WrittenDocument({
				url: 'https://turborepo.dev/docs/getting-started/installation',
				path: 'docs/deps/turborepo/getting-started/installation.md',
				strategy: 'DefuddleStrategy'
			});

			assert.strictEqual(
				rewriteKnownDocLinksInMarkdown(
					path,
					[storybook, installation],
					storybook,
					'[Install](https://turborepo.dev/en/docs/getting-started/installation#start)',
					'docs/deps/turborepo',
					[
						new UrlPrefixReplacement({
							from: 'https://turborepo.dev/en/docs',
							to: 'https://turborepo.dev/docs'
						})
					]
				),
				'[Install](../../getting-started/installation.md#start)'
			);
		}).pipe(Effect.provide(Path.layer)));

	it.effect('keeps published GitHub links local and external subtree links upstream', () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const themes = new WrittenDocument({
				url: 'https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/themes.md',
				path: 'docs/deps/pi/themes.md',
				strategy: 'DirectUrlStrategy'
			});
			const settings = new WrittenDocument({
				url: 'https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/settings.md',
				path: 'docs/deps/pi/settings.md',
				strategy: 'DirectUrlStrategy'
			});

			assert.strictEqual(
				rewriteKnownDocLinksInMarkdown(
					path,
					[themes, settings],
					themes,
					'[Settings](./settings.md) [Dark](../src/modes/interactive/theme/dark.json)'
				),
				'[Settings](settings.md) [Dark](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/modes/interactive/theme/dark.json)'
			);
		}).pipe(Effect.provide(Path.layer)));

	it.effect('keeps repository-relative images on raw image URLs', () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const themes = new WrittenDocument({
				url: 'https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/themes.md',
				path: 'docs/deps/pi/themes.md',
				strategy: 'DirectUrlStrategy'
			});

			assert.strictEqual(
				rewriteKnownDocLinksInMarkdown(
					path,
					[themes],
					themes,
					'![Preview](../assets/theme.png)'
				),
				'![Preview](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/assets/theme.png)'
			);
		}).pipe(Effect.provide(Path.layer)));
});

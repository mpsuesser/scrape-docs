import { assert, describe, it } from '@effect/vitest';

import { Effect, Layer } from 'effect';
import * as Option from 'effect/Option';

import { HttpText } from '../http-text.ts';
import { SitemapIndexStrategy, UrlPrefixReplacement } from '../model.ts';
import {
	SitemapIndexReader,
	SitemapIndexReaderLayer
} from '../sitemap-index.ts';

const outputPathText = (path: Option.Option<string>): string =>
	Option.match(path, {
		onNone: () => '<none>',
		onSome: (value) => value
	});

const makeHttpTextLayer = (body: string): Layer.Layer<HttpText> =>
	Layer.succeed(
		HttpText,
		HttpText.of({
			get: () => Effect.succeed(body)
		})
	);

describe('SitemapIndexReader', () => {
	it.effect('parses markdown sitemaps with relative links and summaries', () => {
		const sitemap = [
			'# Turborepo Documentation Sitemap',
			'',
			'- [Introduction](/docs) | Type: Conceptual | Summary: Welcome to the Turborepo documentation!',
			'    - [Caching](/docs/crafting-your-repository/caching) | Type: Conceptual | Summary: Learn about caching in Turborepo. | Prerequisites: Introduction',
			'- [Blog](/blog) | Type: Conceptual | Summary: Product news.'
		].join('\n');
		const strategy = new SitemapIndexStrategy({
			includeUrlPrefixes: ['https://turborepo.dev/docs'],
			outputPathUrlPrefix: Option.some('https://turborepo.dev/docs')
		});

		return Effect.gen(function* () {
			const reader = yield* SitemapIndexReader;
			const pages = yield* reader.load(
				'https://turborepo.dev/sitemap.md',
				strategy
			);

			assert.strictEqual(pages.length, 2);
			assert.strictEqual(pages[0]?.url, 'https://turborepo.dev/docs');
			assert.strictEqual(pages[0]?.title, 'Introduction');
			assert.strictEqual(
				pages[0]?.description,
				'Welcome to the Turborepo documentation!'
			);
			assert.strictEqual(
				outputPathText(pages[0]?.outputPath ?? Option.none()),
				'index'
			);
			assert.strictEqual(
				pages[1]?.url,
				'https://turborepo.dev/docs/crafting-your-repository/caching'
			);
			assert.strictEqual(
				pages[1]?.description,
				'Learn about caching in Turborepo.'
			);
			assert.strictEqual(
				outputPathText(pages[1]?.outputPath ?? Option.none()),
				'crafting-your-repository/caching'
			);
		}).pipe(
			Effect.provide(SitemapIndexReaderLayer),
			Effect.provide(makeHttpTextLayer(sitemap))
		);
	});

	it.effect('rewrites sitemap URL prefixes before filtering and output-path mapping', () => {
		const sitemap = [
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
			'<url><loc>https://electronjs.org/docs/latest/</loc></url>',
			'<url><loc>https://electronjs.org/docs/latest/api/app</loc></url>',
			'<url><loc>https://electronjs.org/blog</loc></url>',
			'</urlset>'
		].join('');
		const strategy = new SitemapIndexStrategy({
			includeUrlPrefixes: ['https://www.electronjs.org/docs/latest/'],
			outputPathUrlPrefix: Option.some(
				'https://www.electronjs.org/docs/latest/'
			),
			urlPrefixReplacements: [
				new UrlPrefixReplacement({
					from: 'https://electronjs.org/docs/latest/',
					to: 'https://www.electronjs.org/docs/latest/'
				})
			]
		});

		return Effect.gen(function* () {
			const reader = yield* SitemapIndexReader;
			const pages = yield* reader.load(
				'https://www.electronjs.org/sitemap.xml',
				strategy
			);

			assert.strictEqual(pages.length, 2);
			assert.strictEqual(
				pages[0]?.url,
				'https://www.electronjs.org/docs/latest/'
			);
			assert.strictEqual(
				outputPathText(pages[0]?.outputPath ?? Option.none()),
				'index'
			);
			assert.strictEqual(
				pages[1]?.url,
				'https://www.electronjs.org/docs/latest/api/app'
			);
			assert.strictEqual(
				outputPathText(pages[1]?.outputPath ?? Option.none()),
				'api/app'
			);
		}).pipe(
			Effect.provide(SitemapIndexReaderLayer),
			Effect.provide(makeHttpTextLayer(sitemap))
		);
	});
});

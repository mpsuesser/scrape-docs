#!/usr/bin/env bun
import { BunHttpClient, BunRuntime, BunServices } from '@effect/platform-bun';

import { Console, Effect } from 'effect';
import * as Option from 'effect/Option';

import {
	DefuddleStrategy,
	DocScraperLayer,
	DocSetConfig,
	DocSetScraper,
	PageSource,
	RewriteDocsetWebLinksStrategy,
	SitemapIndexStrategy,
	SourceUrlStrategy
} from '../doc-scraper.ts';

const entGoDocSet = new DocSetConfig({
	name: 'ent-go',
	indexUrl: 'https://entgo.io/sitemap.xml',
	indexStrategy: new SitemapIndexStrategy({
		includeUrlPrefixes: ['https://entgo.io/docs/'],
		outputPathUrlPrefix: Option.some('https://entgo.io/docs/')
	}),
	outputDirectory: 'docs/deps/ent-go',
	contentStrategies: [
		new SourceUrlStrategy({
			sources: [
				new PageSource({
					pageUrl: 'https://entgo.io/docs/templates',
					sourceUrl:
						'https://raw.githubusercontent.com/ent/ent/master/doc/md/templates.md'
				}),
				new PageSource({
					pageUrl: 'https://entgo.io/docs/schema-mixin',
					sourceUrl:
						'https://raw.githubusercontent.com/ent/ent/master/doc/md/schema-mixin.md'
				}),
				new PageSource({
					pageUrl: 'https://entgo.io/docs/privacy',
					sourceUrl:
						'https://raw.githubusercontent.com/ent/ent/master/doc/md/privacy.mdx'
				})
			]
		}),
		new DefuddleStrategy({})
	],
	postProcessingStrategies: [new RewriteDocsetWebLinksStrategy({})],
	concurrency: 8,
	cleanOutputDirectory: true
});

const program = Effect.gen(function* () {
	const scraper = yield* DocSetScraper;
	const summary = yield* scraper.scrape(entGoDocSet);
	yield* Console.log(
		`Done: wrote ${summary.pageCount} docs to ${summary.outputDirectory}`
	);
});

program.pipe(
	Effect.provide(DocScraperLayer),
	Effect.provide(BunHttpClient.layer),
	Effect.provide(BunServices.layer),
	BunRuntime.runMain
);

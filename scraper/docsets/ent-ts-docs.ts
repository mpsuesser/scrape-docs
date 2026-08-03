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

const entTsDocSet = new DocSetConfig({
	name: 'ent-ts',
	indexUrl: 'https://ent.dev/sitemap.xml',
	indexStrategy: new SitemapIndexStrategy({
		includeUrlPrefixes: ['https://ent.dev/docs/'],
		outputPathUrlPrefix: Option.some('https://ent.dev/docs/')
	}),
	outputDirectory: 'docs/deps/ent-ts',
	contentStrategies: [
		new SourceUrlStrategy({
			sources: [
				new PageSource({
					pageUrl: 'https://ent.dev/docs/actions/viewer-ent-load',
					sourceUrl:
						'https://raw.githubusercontent.com/lolopinto/ent/main/docs/docs/actions/viewer-ent-load.md'
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
	const summary = yield* scraper.scrape(entTsDocSet);
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

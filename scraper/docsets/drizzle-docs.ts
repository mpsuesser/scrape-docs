#!/usr/bin/env bun
import { BunHttpClient, BunRuntime, BunServices } from '@effect/platform-bun';

import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';

import {
	DefuddleStrategy,
	DocScraperLayer,
	DocSetConfig,
	DocSetScraper,
	RewriteDocsetWebLinksStrategy,
	SitemapIndexStrategy
} from '../doc-scraper.ts';

const drizzleDocsUrlPrefix = 'https://orm.drizzle.team/docs';

const drizzleDocSet = new DocSetConfig({
	name: 'drizzle',
	indexUrl: 'https://orm.drizzle.team/sitemap-0.xml',
	indexStrategy: new SitemapIndexStrategy({
		includeUrlPrefixes: [drizzleDocsUrlPrefix],
		outputPathUrlPrefix: Option.some(drizzleDocsUrlPrefix)
	}),
	outputDirectory: 'docs/deps/drizzle',
	contentStrategies: [new DefuddleStrategy({})],
	postProcessingStrategies: [new RewriteDocsetWebLinksStrategy({})],
	concurrency: 8,
	cleanOutputDirectory: true
});

const program = Effect.fn('scrapeDrizzleDocs')(function* () {
	const scraper = yield* DocSetScraper;
	const summary = yield* scraper.scrape(drizzleDocSet);
	yield* Console.log(
		`Done: wrote ${summary.pageCount} docs to ${summary.outputDirectory}`
	);
})();

program.pipe(
	Effect.provide(DocScraperLayer),
	Effect.provide(BunHttpClient.layer),
	Effect.provide(BunServices.layer),
	BunRuntime.runMain
);

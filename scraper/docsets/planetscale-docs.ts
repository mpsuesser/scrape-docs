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
	MarkdownUrlStrategy,
	RewriteDocsetWebLinksStrategy,
	SitemapIndexStrategy
} from '../doc-scraper.ts';

const planetscaleDocsUrlPrefix = 'https://planetscale.com/docs/';

const planetscaleDocSet = new DocSetConfig({
	name: 'planetscale',
	indexUrl: 'https://planetscale.com/docs/sitemap.xml',
	indexStrategy: new SitemapIndexStrategy({
		includeUrlPrefixes: [planetscaleDocsUrlPrefix],
		outputPathUrlPrefix: Option.some(planetscaleDocsUrlPrefix)
	}),
	outputDirectory: 'docs/deps/planetscale',
	contentStrategies: [
		new MarkdownUrlStrategy({}),
		new DefuddleStrategy({})
	],
	postProcessingStrategies: [new RewriteDocsetWebLinksStrategy({})],
	concurrency: 8,
	cleanOutputDirectory: true
});

const program = Effect.fn('scrapePlanetscaleDocs')(function* () {
	const scraper = yield* DocSetScraper;
	const summary = yield* scraper.scrape(planetscaleDocSet);
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

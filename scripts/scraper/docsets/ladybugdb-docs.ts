#!/usr/bin/env bun
import { BunHttpClient, BunRuntime, BunServices } from '@effect/platform-bun';

import { Console, Effect } from 'effect';

import {
	DirectUrlStrategy,
	DocScraperLayer,
	DocSetConfig,
	DocSetScraper,
	GithubMarkdownDirectoryIndexStrategy,
	RewriteDocsetWebLinksStrategy
} from '../doc-scraper.ts';

const ladybugdbDocSet = new DocSetConfig({
	name: 'ladybugdb',
	indexUrl:
		'https://github.com/LadybugDB/ladybug-docs/tree/main/src/content/docs',
	indexStrategy: new GithubMarkdownDirectoryIndexStrategy({}),
	outputDirectory: 'docs/deps/ladybugdb',
	contentStrategies: [new DirectUrlStrategy({})],
	postProcessingStrategies: [new RewriteDocsetWebLinksStrategy({})],
	concurrency: 8,
	cleanOutputDirectory: true
});

const program = Effect.gen(function* () {
	const scraper = yield* DocSetScraper;
	const summary = yield* scraper.scrape(ladybugdbDocSet);
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

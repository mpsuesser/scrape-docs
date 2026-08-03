#!/usr/bin/env bun
import { BunHttpClient, BunRuntime, BunServices } from '@effect/platform-bun';

import { Console, Effect } from 'effect';

import {
	DefuddleStrategy,
	DocScraperLayer,
	DocSetConfig,
	DocSetScraper,
	LlmsTxtIndexStrategy,
	MarkdownUrlStrategy,
	RewriteDocsetWebLinksStrategy
} from '../doc-scraper.ts';

const alchemyDocSet = new DocSetConfig({
	name: 'alchemy',
	indexUrl: 'https://v2.alchemy.run/llms.txt',
	indexStrategy: new LlmsTxtIndexStrategy({}),
	outputDirectory: 'docs/deps/alchemy',
	contentStrategies: [
		new MarkdownUrlStrategy({}),
		new DefuddleStrategy({})
	],
	postProcessingStrategies: [new RewriteDocsetWebLinksStrategy({})],
	concurrency: 8,
	cleanOutputDirectory: true
});

const program = Effect.gen(function* () {
	const scraper = yield* DocSetScraper;
	const summary = yield* scraper.scrape(alchemyDocSet);
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

#!/usr/bin/env bun
import { BunHttpClient, BunRuntime, BunServices } from '@effect/platform-bun';

import { Console, Effect } from 'effect';

import {
	DefuddleStrategy,
	DocScraperLayer,
	DocSetConfig,
	DocSetScraper,
	LlmsTxtIndexStrategy,
	MarkdownUrlStrategy
} from '../doc-scraper.ts';

const foldkitDocSet = new DocSetConfig({
	name: 'foldkit',
	indexUrl: 'https://foldkit.dev/llms.txt',
	indexStrategy: new LlmsTxtIndexStrategy({}),
	outputDirectory: 'docs/deps/foldkit',
	contentStrategies: [
		new MarkdownUrlStrategy({}),
		new DefuddleStrategy({})
	],
	concurrency: 8,
	cleanOutputDirectory: true
});

const program = Effect.gen(function* () {
	const scraper = yield* DocSetScraper;
	const summary = yield* scraper.scrape(foldkitDocSet);
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

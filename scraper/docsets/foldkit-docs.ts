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
	indexStrategy: new LlmsTxtIndexStrategy({
		excludeUrls: [
			'https://foldkit.dev/llms-full.txt',
			'https://foldkit.dev/api/v1',
			'https://foldkit.dev/openapi.json',
			'https://foldkit.dev/sitemap.xml',
			'https://foldkit.dev/blog/rss.xml',
			'https://github.com/foldkit/foldkit'
		]
	}),
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

#!/usr/bin/env bun
import { BunHttpClient, BunRuntime, BunServices } from '@effect/platform-bun';

import { Console, Effect } from 'effect';

import {
	DirectUrlStrategy,
	DocScraperLayer,
	DocSetConfig,
	DocSetScraper,
	GithubMarkdownDirectoryIndexStrategy
} from '../doc-scraper.ts';

const tsMorphDocSet = new DocSetConfig({
	name: 'ts-morph',
	indexUrl: 'https://github.com/dsherret/ts-morph/tree/latest/docs',
	indexStrategy: new GithubMarkdownDirectoryIndexStrategy({}),
	outputDirectory: 'docs/deps/ts-morph',
	contentStrategies: [new DirectUrlStrategy({})],
	concurrency: 8,
	cleanOutputDirectory: true
});

const program = Effect.gen(function* () {
	const scraper = yield* DocSetScraper;
	const summary = yield* scraper.scrape(tsMorphDocSet);
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

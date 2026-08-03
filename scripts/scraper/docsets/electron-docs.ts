#!/usr/bin/env bun
import { BunHttpClient, BunRuntime, BunServices } from '@effect/platform-bun';

import { Console, Effect } from 'effect';
import * as Option from 'effect/Option';

import {
	DefuddleStrategy,
	DocScraperLayer,
	DocSetConfig,
	DocSetScraper,
	RewriteDocsetWebLinksStrategy,
	SitemapIndexStrategy,
	UrlPrefixReplacement
} from '../doc-scraper.ts';

const electronDocSet = new DocSetConfig({
	name: 'electron',
	indexUrl: 'https://www.electronjs.org/sitemap.xml',
	indexStrategy: new SitemapIndexStrategy({
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
	}),
	outputDirectory: 'docs/deps/electron',
	contentStrategies: [new DefuddleStrategy({})],
	postProcessingStrategies: [new RewriteDocsetWebLinksStrategy({})],
	concurrency: 8,
	cleanOutputDirectory: true
});

const program = Effect.gen(function* () {
	const scraper = yield* DocSetScraper;
	const summary = yield* scraper.scrape(electronDocSet);
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

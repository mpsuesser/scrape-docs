#!/usr/bin/env bun
import { BunHttpClient, BunRuntime, BunServices } from '@effect/platform-bun';

import { Console, Effect } from 'effect';
import * as Option from 'effect/Option';

import {
	DefuddleStrategy,
	DocScraperLayer,
	DocSetConfig,
	DocSetScraper,
	MarkdownUrlStrategy,
	RewriteDocsetWebLinksStrategy,
	SitemapIndexStrategy,
	UrlPrefixReplacement
} from '../doc-scraper.ts';

const turborepoDocSet = new DocSetConfig({
	name: 'turborepo',
	indexUrl: 'https://turborepo.dev/sitemap.md',
	indexStrategy: new SitemapIndexStrategy({
		includeUrlPrefixes: ['https://turborepo.dev/docs'],
		outputPathUrlPrefix: Option.some('https://turborepo.dev/docs')
	}),
	outputDirectory: 'docs/deps/turborepo',
	contentStrategies: [
		new MarkdownUrlStrategy({}),
		new DefuddleStrategy({})
	],
	postProcessingStrategies: [
		new RewriteDocsetWebLinksStrategy({
			urlPrefixReplacements: [
				new UrlPrefixReplacement({
					from: 'https://turborepo.dev/en/docs',
					to: 'https://turborepo.dev/docs'
				})
			]
		})
	],
	concurrency: 8,
	cleanOutputDirectory: true
});

const program = Effect.gen(function* () {
	const scraper = yield* DocSetScraper;
	const summary = yield* scraper.scrape(turborepoDocSet);
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

#!/usr/bin/env bun
import { BunHttpClient, BunRuntime, BunServices } from '@effect/platform-bun';

import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';

import {
	DirectUrlStrategy,
	DefuddleStrategy,
	DocScraperLayer,
	DocSetConfig,
	DocSetScraper,
	RewriteDocsetWebLinksStrategy,
	SitemapIndexStrategy,
	UrlPrefixReplacement
} from '../doc-scraper.ts';

const betterAuthDocsUrlPrefix = 'https://better-auth.com/docs/';
const betterAuthLlmsDocsUrlPrefix = 'https://better-auth.com/llms.txt/docs/';

const betterAuthDocSet = new DocSetConfig({
	name: 'better-auth',
	indexUrl: 'https://better-auth.com/sitemap.xml',
	indexStrategy: new SitemapIndexStrategy({
		includeUrlPrefixes: [betterAuthLlmsDocsUrlPrefix],
		outputPathUrlPrefix: Option.some(betterAuthLlmsDocsUrlPrefix),
		urlPrefixReplacements: [
			new UrlPrefixReplacement({
				from: betterAuthDocsUrlPrefix,
				to: betterAuthLlmsDocsUrlPrefix
			})
		]
	}),
	outputDirectory: 'docs/deps/better-auth',
	contentStrategies: [
		new DirectUrlStrategy({ normalizeMdx: true }),
		new DefuddleStrategy({
			urlPrefixReplacements: [
				new UrlPrefixReplacement({
					from: betterAuthLlmsDocsUrlPrefix,
					to: betterAuthDocsUrlPrefix
				})
			]
		})
	],
	postProcessingStrategies: [
		new RewriteDocsetWebLinksStrategy({
			urlPrefixReplacements: [
				new UrlPrefixReplacement({
					from: betterAuthDocsUrlPrefix,
					to: betterAuthLlmsDocsUrlPrefix
				})
			]
		})
	],
	concurrency: 8,
	cleanOutputDirectory: true
});

const program = Effect.fn('scrapeBetterAuthDocs')(function* () {
	const scraper = yield* DocSetScraper;
	const summary = yield* scraper.scrape(betterAuthDocSet);
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

import {
	Array as Arr,
	Boolean as Bool,
	Clock,
	Console,
	Context,
	Effect,
	Layer,
	Match
} from 'effect';

import { DocPostProcessor } from './doc-post-processor.ts';
import { DocWriter } from './doc-writer.ts';
import {
	AllContentStrategiesFailed,
	DocPostProcessError,
	DocWriteError,
	GithubMarkdownDirectoryIndexParseError,
	HttpFetchError,
	InvalidDocUrlError,
	LlmsIndexParseError,
	SitemapIndexParseError
} from './errors.ts';
import { GithubMarkdownDirectoryIndexReader } from './github-markdown-directory-index.ts';
import { LlmsIndexReader } from './llms-index.ts';
import { ScrapeSummary, type DocSetConfig } from './model.ts';
import { PageContentLoader } from './page-content-loader.ts';
import { SitemapIndexReader } from './sitemap-index.ts';

const isoNow = Clock.currentTimeMillis.pipe(
	Effect.map((millis) => new globalThis.Date(millis).toISOString())
);

export class DocSetScraper extends Context.Service<
	DocSetScraper,
	{
		readonly scrape: (
			docSet: DocSetConfig
		) => Effect.Effect<
			ScrapeSummary,
			| AllContentStrategiesFailed
			| DocPostProcessError
			| DocWriteError
			| GithubMarkdownDirectoryIndexParseError
			| HttpFetchError
			| InvalidDocUrlError
			| LlmsIndexParseError
			| SitemapIndexParseError
		>;
	}
>()('@mydb/scripts/scraper/DocSetScraper') {}

export const DocSetScraperLayer: Layer.Layer<
	DocSetScraper,
	never,
	| DocPostProcessor
	| DocWriter
	| GithubMarkdownDirectoryIndexReader
	| LlmsIndexReader
	| PageContentLoader
	| SitemapIndexReader
> = Layer.effect(
	DocSetScraper,
	Effect.gen(function* () {
		const githubMarkdownDirectoryIndexes =
			yield* GithubMarkdownDirectoryIndexReader;
		const llmsIndexes = yield* LlmsIndexReader;
		const sitemapIndexes = yield* SitemapIndexReader;
		const contentLoader = yield* PageContentLoader;
		const postProcessor = yield* DocPostProcessor;
		const writer = yield* DocWriter;

		const scrape = Effect.fn('DocSetScraper.scrape')(
			function* (docSet: DocSetConfig) {
				const timestamp = yield* isoNow;
				const pages = yield* Match.value(docSet.indexStrategy).pipe(
					Match.tag(
						'LlmsTxtIndexStrategy',
						() => llmsIndexes.load(docSet.indexUrl)
					),
					Match.tag(
						'SitemapIndexStrategy',
						(strategy) =>
							sitemapIndexes.load(docSet.indexUrl, strategy)
					),
					Match.tag(
						'GithubMarkdownDirectoryIndexStrategy',
						(strategy) =>
							githubMarkdownDirectoryIndexes.load(
								docSet.indexUrl,
								strategy
							)
					),
					Match.exhaustive
				);
				yield* Console.log(
					`Scraping ${Arr.length(pages)} ${docSet.name} docs...`
				);
				yield* Bool.match(docSet.cleanOutputDirectory, {
					onFalse: () => Effect.void,
					onTrue: () => writer.prepare(docSet)
				});
				const writtenDocuments = yield* Effect.forEach(
					pages,
					(page) =>
						Effect.gen(function* () {
							const content = yield* contentLoader.load(
								page,
								docSet.contentStrategies
							);
							const written = yield* writer.write(
								docSet,
								page,
								content,
								timestamp
							);
							yield* Console.log(`Wrote ${written.path}`);
							return written;
						}),
					{ concurrency: docSet.concurrency }
				);
				const postProcessedCount = yield* postProcessor.process(
					docSet,
					writtenDocuments
				);
				yield* Bool.match(postProcessedCount > 0, {
					onFalse: () => Effect.void,
					onTrue: () =>
						Console.log(
							`Post-processed ${postProcessedCount} ${docSet.name} docs`
						)
				});

				return new ScrapeSummary({
					docSetName: docSet.name,
					outputDirectory: docSet.outputDirectory,
					pageCount: Arr.length(writtenDocuments),
					writtenDocuments
				});
			}
		);

		return DocSetScraper.of({ scrape });
	})
);

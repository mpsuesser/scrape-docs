import { Defuddle } from 'defuddle/node';
import { parseHTML } from 'linkedom';

import { Context, Effect, Layer } from 'effect';

import { PageContentError } from './errors.ts';

export class DefuddleExtractor extends Context.Service<
	DefuddleExtractor,
	{
		readonly extractMarkdown: (
			url: string,
			html: string
		) => Effect.Effect<string, PageContentError>;
	}
>()('@mydb/scripts/scraper/DefuddleExtractor') {}

export const DefuddleExtractorLayer: Layer.Layer<DefuddleExtractor> = Layer
	.succeed(
		DefuddleExtractor,
		DefuddleExtractor.of({
			extractMarkdown: Effect.fn('DefuddleExtractor.extractMarkdown')(
				function* (url: string, html: string) {
					const parsed = yield* Effect.try({
						try: () => parseHTML(html).document,
						catch: (cause) =>
							new PageContentError({
								url,
								strategy: 'DefuddleStrategy',
								message: `Parsing HTML for ${url} failed`,
								cause
							})
					});

					const result = yield* Effect.tryPromise({
						try: () =>
							Defuddle(parsed, url, {
								markdown: true,
								useAsync: false
							}),
						catch: (cause) =>
							new PageContentError({
								url,
								strategy: 'DefuddleStrategy',
								message:
									`Defuddle extraction for ${url} failed`,
								cause
							})
					});

					return result.content;
				}
			)
		})
	);

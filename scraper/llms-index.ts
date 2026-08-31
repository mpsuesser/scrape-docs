import {
	Array as Arr,
	Boolean as Bool,
	Context,
	Effect,
	Layer,
	String as Str
} from 'effect';
import { pipe } from 'effect/Function';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';

import { HttpFetchError, LlmsIndexParseError } from './errors.ts';
import { HttpText } from './http-text.ts';
import { DocPage, type LlmsTxtIndexStrategy } from './model.ts';

const llmsEntryLine =
	/^- \[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*(?::|[—–-])\s*(.*)$/;

const group = (match: RegExpMatchArray, index: number) =>
	Option.fromNullishOr(match[index]);

const parseIndexLine = (line: string): Option.Option<DocPage> =>
	pipe(
		line,
		Str.match(llmsEntryLine),
		Option.flatMap((match) =>
			pipe(
				Option.Do,
				Option.bind('title', () => group(match, 1)),
				Option.bind('url', () => group(match, 2)),
				Option.bind('description', () => group(match, 3)),
				Option.map(
					({ description, title, url }) =>
						new DocPage({
							description: Str.trim(description),
							title: Str.trim(title),
							url: Str.trim(url)
						})
				)
			)
		)
	);

const parseLlmsIndex = (
	url: string,
	body: string,
	strategy: LlmsTxtIndexStrategy
): Effect.Effect<ReadonlyArray<DocPage>, LlmsIndexParseError> =>
	Effect.gen(function* () {
		const urlEquals = Schema.toEquivalence(Schema.String);
		const pages = pipe(
			Str.split(body, '\n'),
			Arr.flatMap((line) =>
				pipe(
					parseIndexLine(line),
					Option.match({
						onNone: () => [],
						onSome: (page) => [page]
					})
				)
			),
			Arr.filter((page) =>
				Bool.not(
					Arr.some(strategy.excludeUrls, (excludedUrl) =>
						urlEquals(excludedUrl, page.url)
					)
				)
			)
		);

		return yield* Arr.match(pages, {
			onEmpty: () =>
				Effect.fail(
					new LlmsIndexParseError({
						url,
						message: `No documentation entries were found in ${url}`
					})
				),
			onNonEmpty: (nonEmptyPages) => Effect.succeed(nonEmptyPages)
		});
	});

export class LlmsIndexReader extends Context.Service<
	LlmsIndexReader,
	{
		readonly load: (
			url: string,
			strategy: LlmsTxtIndexStrategy
		) => Effect.Effect<
			ReadonlyArray<DocPage>,
			HttpFetchError | LlmsIndexParseError
		>;
	}
>()('@mydb/scraper/LlmsIndexReader') {}

export const LlmsIndexReaderLayer: Layer.Layer<
	LlmsIndexReader,
	never,
	HttpText
> = Layer.effect(
	LlmsIndexReader,
	Effect.gen(function* () {
		const http = yield* HttpText;

		const load = Effect.fn('LlmsIndexReader.load')(function* (
			url: string,
			strategy: LlmsTxtIndexStrategy
		) {
			const body = yield* http.get(url);
			return yield* parseLlmsIndex(url, body, strategy);
		});

		return LlmsIndexReader.of({ load });
	})
);

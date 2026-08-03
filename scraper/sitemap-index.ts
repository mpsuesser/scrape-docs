import { Array as Arr, Context, Effect, Layer, String as Str } from 'effect';
import { pipe } from 'effect/Function';
import * as Option from 'effect/Option';

import {
	HttpFetchError,
	InvalidDocUrlError,
	SitemapIndexParseError
} from './errors.ts';
import { HttpText } from './http-text.ts';
import {
	DocPage,
	type SitemapIndexStrategy,
	type UrlPrefixReplacement
} from './model.ts';
import { decodeUrl } from './url-paths.ts';

const sitemapLocElement = /<loc>\s*(https?:\/\/[^<]+?)\s*<\/loc>/g;
const markdownSitemapEntryLine = /^\s*-\s+\[([^\]]+)\]\(([^)]+)\)\s*\|\s*(.*)$/;
const markdownSitemapSummary = /(?:^|\|\s*)Summary:\s*([^|]+)/;

const group = (match: RegExpMatchArray, index: number) =>
	Option.fromNullishOr(match[index]);

const matchesIncludedPrefix = (
	includeUrlPrefixes: ReadonlyArray<string>,
	url: string
): boolean =>
	Arr.match(includeUrlPrefixes, {
		onEmpty: () => true,
		onNonEmpty: (prefixes) =>
			Arr.some(prefixes, (prefix) => Str.startsWith(prefix)(url))
	});

const replaceUrlPrefix = (
	replacements: ReadonlyArray<UrlPrefixReplacement>,
	url: string
): string =>
	pipe(
		replacements,
		Arr.findFirst((replacement) => Str.startsWith(replacement.from)(url)),
		Option.match({
			onNone: () => url,
			onSome: (replacement) =>
				`${replacement.to}${
					pipe(url, Str.slice(replacement.from.length))
				}`
		})
	);

const stripLeadingPathSeparator = (path: string): string =>
	Str.startsWith('/')(path) ? pipe(path, Str.slice(1)) : path;

const outputPathFromUrlPrefix = (
	indexUrl: string,
	pageUrl: string,
	strategy: SitemapIndexStrategy
): Effect.Effect<Option.Option<string>, SitemapIndexParseError> =>
	Option.match(strategy.outputPathUrlPrefix, {
		onNone: () => Effect.succeed(Option.none()),
		onSome: (prefix) => {
			if (Str.startsWith(prefix)(pageUrl)) {
				const relativePath = pipe(
					pageUrl,
					Str.slice(prefix.length),
					stripLeadingPathSeparator
				);
				return Effect.succeed(
					Option.some(
						Str.isEmpty(relativePath) ? 'index' : relativePath
					)
				);
			}

			return Effect.fail(
				new SitemapIndexParseError({
					url: indexUrl,
					message:
						`Sitemap page URL ${pageUrl} does not match output path prefix ${prefix}`
				})
			);
		}
	});

const pageTitleFromUrl = Effect.fn('SitemapIndexReader.pageTitleFromUrl')(
	function* (url: string) {
		const parsed = yield* decodeUrl(url);
		const segments = pipe(
			Str.split(parsed.pathname, '/'),
			Arr.filter(Str.isNonEmpty)
		);

		return Arr.match(segments, {
			onEmpty: () => parsed.hostname,
			onNonEmpty: (nonEmptySegments) =>
				pipe(
					Arr.lastNonEmpty(nonEmptySegments),
					Str.replaceAll('.html', ''),
					Str.split('-'),
					Arr.filter(Str.isNonEmpty),
					Arr.map(Str.capitalize),
					Arr.join(' ')
				)
		});
	}
);

const descriptionFromMarkdownSitemapMetadata = (metadata: string): string =>
	pipe(
		Str.match(markdownSitemapSummary)(metadata),
		Option.flatMap((match) => group(match, 1)),
		Option.map(Str.trim),
		Option.getOrElse(() => '')
	);

const markdownSitemapEntries = (body: string) =>
	pipe(
		Str.split(body, '\n'),
		Arr.flatMap((line) =>
			pipe(
				Str.match(markdownSitemapEntryLine)(line),
				Option.flatMap((match) =>
					pipe(
						Option.Do,
						Option.bind('title', () => group(match, 1)),
						Option.bind('href', () => group(match, 2)),
						Option.bind('metadata', () => group(match, 3)),
						Option.map(({ href, metadata, title }) => ({
							description: descriptionFromMarkdownSitemapMetadata(
								metadata
							),
							href: Str.trim(href),
							title: Str.trim(title)
						}))
					)
				),
				Option.match({
					onNone: () => [],
					onSome: (entry) => [entry]
				})
			)
		)
	);

const resolveSitemapHref = (
	indexUrl: string,
	href: string
): Effect.Effect<string, InvalidDocUrlError> =>
	Effect.try({
		try: () => new globalThis.URL(href, indexUrl).toString(),
		catch: (cause) =>
			new InvalidDocUrlError({
				url: href,
				message: `Invalid sitemap href ${href} in ${indexUrl}`,
				cause
			})
	});

const optionToArray = <A>(option: Option.Option<A>): ReadonlyArray<A> =>
	Option.match(option, {
		onNone: () => [],
		onSome: (value) => [value]
	});

const parseXmlSitemapPages = (
	url: string,
	body: string,
	strategy: SitemapIndexStrategy
): Effect.Effect<
	ReadonlyArray<DocPage>,
	InvalidDocUrlError | SitemapIndexParseError
> => Effect.gen(function* () {
	const pageUrls = pipe(
		Str.matchAll(sitemapLocElement)(body),
		Arr.fromIterable,
		Arr.flatMap((match) =>
			pipe(
				group(match, 1),
				Option.map(Str.trim),
				Option.match({
					onNone: () => [],
					onSome: (pageUrl) => [pageUrl]
				})
			)
		),
		Arr.filter(Str.isNonEmpty),
		Arr.map((pageUrl) =>
			replaceUrlPrefix(strategy.urlPrefixReplacements, pageUrl)
		),
		Arr.filter((pageUrl) =>
			matchesIncludedPrefix(strategy.includeUrlPrefixes, pageUrl)
		),
		Arr.dedupe
	);

	return yield* Effect.forEach(
		pageUrls,
		(pageUrl) =>
			Effect.gen(function* () {
				const outputPath = yield* outputPathFromUrlPrefix(
					url,
					pageUrl,
					strategy
				);
				const title = yield* pageTitleFromUrl(pageUrl);
				return new DocPage({
					description: '',
					outputPath,
					title,
					url: pageUrl
				});
			}),
		{ concurrency: 1 }
	);
});

const parseMarkdownSitemapPages = (
	url: string,
	body: string,
	strategy: SitemapIndexStrategy
): Effect.Effect<
	ReadonlyArray<DocPage>,
	InvalidDocUrlError | SitemapIndexParseError
> => Effect.gen(function* () {
	const entries = markdownSitemapEntries(body);
	const pages = yield* Effect.forEach(
		entries,
		(entry) =>
			Effect.gen(function* () {
				const resolvedUrl = yield* resolveSitemapHref(url, entry.href);
				const pageUrl = replaceUrlPrefix(
					strategy.urlPrefixReplacements,
					resolvedUrl
				);

				if (
					!matchesIncludedPrefix(strategy.includeUrlPrefixes, pageUrl)
				) {
					return Option.none<DocPage>();
				}

				const outputPath = yield* outputPathFromUrlPrefix(
					url,
					pageUrl,
					strategy
				);
				return Option.some(
					new DocPage({
						description: entry.description,
						outputPath,
						title: entry.title,
						url: pageUrl
					})
				);
			}),
		{ concurrency: 1 }
	);

	return pipe(
		pages,
		Arr.flatMap(optionToArray),
		Arr.dedupeWith((left, right) => left.url === right.url)
	);
});

const requireNonEmptyPages = (
	url: string,
	pages: ReadonlyArray<DocPage>
): Effect.Effect<ReadonlyArray<DocPage>, SitemapIndexParseError> =>
	Arr.match(pages, {
		onEmpty: () =>
			Effect.fail(
				new SitemapIndexParseError({
					url,
					message:
						`No matching documentation URLs were found in ${url}`
				})
			),
		onNonEmpty: (nonEmptyPages) => Effect.succeed(nonEmptyPages)
	});

const parseSitemapIndex = (
	url: string,
	body: string,
	strategy: SitemapIndexStrategy
): Effect.Effect<
	ReadonlyArray<DocPage>,
	InvalidDocUrlError | SitemapIndexParseError
> => Effect.gen(function* () {
	const entries = markdownSitemapEntries(body);
	const pages = yield* Arr.match(entries, {
		onEmpty: () => parseXmlSitemapPages(url, body, strategy),
		onNonEmpty: () => parseMarkdownSitemapPages(url, body, strategy)
	});

	return yield* requireNonEmptyPages(url, pages);
});

export class SitemapIndexReader extends Context.Service<
	SitemapIndexReader,
	{
		readonly load: (
			url: string,
			strategy: SitemapIndexStrategy
		) => Effect.Effect<
			ReadonlyArray<DocPage>,
			HttpFetchError | InvalidDocUrlError | SitemapIndexParseError
		>;
	}
>()('@mydb/scraper/SitemapIndexReader') {}

export const SitemapIndexReaderLayer: Layer.Layer<
	SitemapIndexReader,
	never,
	HttpText
> = Layer.effect(
	SitemapIndexReader,
	Effect.gen(function* () {
		const http = yield* HttpText;

		const load = Effect.fn('SitemapIndexReader.load')(
			function* (url: string, strategy: SitemapIndexStrategy) {
				const body = yield* http.get(url);
				return yield* parseSitemapIndex(url, body, strategy);
			}
		);

		return SitemapIndexReader.of({ load });
	})
);

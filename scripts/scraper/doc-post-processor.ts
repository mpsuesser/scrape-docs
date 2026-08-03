import {
	Array as Arr,
	Boolean as Bool,
	Context,
	Effect,
	FileSystem,
	HashMap,
	Layer,
	Match,
	Path,
	Schema,
	String as Str
} from 'effect';
import { pipe } from 'effect/Function';
import * as Option from 'effect/Option';

import { DocPostProcessError } from './errors.ts';
import {
	type DocSetConfig,
	type PostProcessingStrategy,
	type WrittenDocument
} from './model.ts';

const leadingFrontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const webUrl = /https?:\/\/[^\s<>)"']+/g;
const stringEquivalence = Schema.toEquivalence(Schema.String);
const decodeUrlOption = Schema.decodeUnknownOption(Schema.URLFromString);

const group = (match: RegExpMatchArray, index: number) =>
	Option.fromNullishOr(match[index]);

const normalizePathname = (pathname: string): string =>
	pathname !== '/' && Str.endsWith('/')(pathname)
		? pipe(pathname, Str.slice(0, -1))
		: pathname;

const normalizeHostname = (hostname: string): string =>
	Str.startsWith('www.')(hostname) ? pipe(hostname, Str.slice(4)) : hostname;

const normalizedDocUrlKey = (url: URL): string => {
	url.hash = '';
	url.search = '';
	url.hostname = normalizeHostname(url.hostname);
	url.pathname = normalizePathname(url.pathname);
	return url.toString();
};

const normalizedDocUrlKeyFromString = (url: string): Option.Option<string> =>
	pipe(decodeUrlOption(url), Option.map(normalizedDocUrlKey));

const knownDocumentPathByUrl = (
	documents: ReadonlyArray<WrittenDocument>
): HashMap.HashMap<string, string> =>
	HashMap.fromIterable(
		pipe(
			documents,
			Arr.flatMap((document) =>
				pipe(
					normalizedDocUrlKeyFromString(document.url),
					Option.match({
						onNone: () => [],
						onSome: (key) => {
							const entry: readonly [string, string] = [
								key,
								document.path
							];
							return [entry];
						}
					})
				)
			)
		)
	);

const leadingFrontmatterText = (content: string): string =>
	pipe(
		content,
		Str.match(leadingFrontmatter),
		Option.flatMap((match) => group(match, 0)),
		Option.getOrElse(() => '')
	);

const normalizePathSeparators = (path: Path.Path, relativePath: string) =>
	path.sep === '/'
		? relativePath
		: pipe(relativePath, Str.replaceAll(path.sep, '/'));

const relativeMarkdownPath = (
	path: Path.Path,
	source: WrittenDocument,
	targetPath: string
): string =>
	pipe(
		path.relative(path.dirname(source.path), targetPath),
		(relativePath) => normalizePathSeparators(path, relativePath)
	);

const rootHrefCandidatesForPath = (
	path: Path.Path,
	outputDirectory: string,
	documentPath: string
): ReadonlyArray<string> => {
	const relativePath = pipe(
		path.relative(outputDirectory, documentPath),
		(relative) => normalizePathSeparators(path, relative)
	);
	const withoutExtension = pipe(relativePath, Str.replace(/\.md$/, ''));

	if (withoutExtension === 'index') {
		return ['/', '/index', '/index.md'];
	}

	if (Str.endsWith('/index')(withoutExtension)) {
		const directoryPath = pipe(
			withoutExtension,
			Str.slice(0, -'/index'.length)
		);
		return [
			`/${directoryPath}`,
			`/${directoryPath}/`,
			`/${withoutExtension}`,
			`/${relativePath}`
		];
	}

	return [
		`/${withoutExtension}`,
		`/${withoutExtension}/`,
		`/${relativePath}`
	];
};

const knownDocumentPathByRootHref = (
	path: Path.Path,
	outputDirectory: string,
	documents: ReadonlyArray<WrittenDocument>
): HashMap.HashMap<string, string> =>
	HashMap.fromIterable(
		pipe(
			documents,
			Arr.flatMap((document) =>
				pipe(
					rootHrefCandidatesForPath(
						path,
						outputDirectory,
						document.path
					),
					Arr.map((href) => {
						const entry: readonly [string, string] = [
							href,
							document.path
						];
						return entry;
					})
				)
			)
		)
	);

const replacementForUrl = (
	path: Path.Path,
	knownPathsByUrl: HashMap.HashMap<string, string>,
	source: WrittenDocument,
	urlText: string
): Option.Option<string> =>
	pipe(
		decodeUrlOption(urlText),
		Option.flatMap((url) => {
			const suffix = `${url.search}${url.hash}`;
			return pipe(
				HashMap.get(knownPathsByUrl, normalizedDocUrlKey(url)),
				Option.map(
					(targetPath) =>
						`${
							relativeMarkdownPath(path, source, targetPath)
						}${suffix}`
				)
			);
		})
	);

const rewriteKnownUrls = (
	path: Path.Path,
	knownPathsByUrl: HashMap.HashMap<string, string>,
	source: WrittenDocument,
	body: string
): string => {
	const urls = pipe(
		Str.matchAll(webUrl)(body),
		Arr.fromIterable,
		Arr.flatMap((match) =>
			pipe(
				group(match, 0),
				Option.match({
					onNone: () => [],
					onSome: (urlText) => [urlText]
				})
			)
		),
		Arr.dedupe
	);

	return pipe(
		urls,
		Arr.reduce(body, (rewritten, urlText) =>
			pipe(
				replacementForUrl(path, knownPathsByUrl, source, urlText),
				Option.match({
					onNone: () => rewritten,
					onSome: (replacement) =>
						pipe(rewritten, Str.replaceAll(urlText, replacement))
				})
			))
	);
};

const rootRelativeMarkdownHref = /\]\((\/(?!\/)[^)#?\s]+)([?#][^)]*)?\)/g;

const rewriteKnownRootRelativeLinks = (
	path: Path.Path,
	knownPathsByRootHref: HashMap.HashMap<string, string>,
	source: WrittenDocument,
	body: string
): string => {
	const hrefs = pipe(
		Str.matchAll(rootRelativeMarkdownHref)(body),
		Arr.fromIterable,
		Arr.flatMap((match) =>
			pipe(
				group(match, 1),
				Option.match({
					onNone: () => [],
					onSome: (href) => [
						{
							href,
							suffix: pipe(
								group(match, 2),
								Option.getOrElse(() => '')
							)
						}
					]
				})
			)
		),
		Arr.dedupeWith((left, right) =>
			left.href === right.href && left.suffix === right.suffix
		)
	);

	return pipe(
		hrefs,
		Arr.reduce(body, (rewritten, { href, suffix }) =>
			pipe(
				HashMap.get(knownPathsByRootHref, href),
				Option.match({
					onNone: () => rewritten,
					onSome: (targetPath) => {
						const replacement = relativeMarkdownPath(
							path,
							source,
							targetPath
						);
						return pipe(
							rewritten,
							Str.replaceAll(
								`](${href}${suffix})`,
								`](${replacement}${suffix})`
							)
						);
					}
				})
			))
	);
};

/**
 * Rewrites links that point to other documents in the same scraped docset to relative markdown paths.
 */
export const rewriteKnownDocLinksInMarkdown = (
	path: Path.Path,
	documents: ReadonlyArray<WrittenDocument>,
	source: WrittenDocument,
	content: string,
	outputDirectory?: string
): string => {
	const frontmatter = leadingFrontmatterText(content);
	const body = pipe(content, Str.slice(frontmatter.length));
	const knownPathsByUrl = knownDocumentPathByUrl(documents);
	const rewrittenUrls = rewriteKnownUrls(path, knownPathsByUrl, source, body);
	return `${frontmatter}${
		Option.match(Option.fromNullishOr(outputDirectory), {
			onNone: () => rewrittenUrls,
			onSome: (directory) =>
				rewriteKnownRootRelativeLinks(
					path,
					knownDocumentPathByRootHref(path, directory, documents),
					source,
					rewrittenUrls
				)
		})
	}`;
};

const mapPostProcessError =
	(targetPath: string, action: string) => (cause: unknown) =>
		new DocPostProcessError({
			path: targetPath,
			message: `${action} ${targetPath} failed`,
			cause
		});

export class DocPostProcessor extends Context.Service<
	DocPostProcessor,
	{
		readonly process: (
			docSet: DocSetConfig,
			documents: ReadonlyArray<WrittenDocument>
		) => Effect.Effect<number, DocPostProcessError>;
	}
>()('@mydb/scripts/scraper/DocPostProcessor') {}

export const DocPostProcessorLayer: Layer.Layer<
	DocPostProcessor,
	never,
	FileSystem.FileSystem | Path.Path
> = Layer.effect(
	DocPostProcessor,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const rewriteDocsetWebLinks = Effect.fn(
			'DocPostProcessor.rewriteDocsetWebLinks'
		)(function* (
			docSet: DocSetConfig,
			documents: ReadonlyArray<WrittenDocument>
		) {
			const changed = yield* Effect.forEach(
				documents,
				(document) =>
					Effect.gen(function* () {
						const current = yield* fs
							.readFileString(document.path)
							.pipe(
								Effect.mapError(
									mapPostProcessError(
										document.path,
										'Reading'
									)
								)
							);
						const next = rewriteKnownDocLinksInMarkdown(
							path,
							documents,
							document,
							current,
							docSet.outputDirectory
						);
						const unchanged = stringEquivalence(current, next);
						yield* Bool.match(unchanged, {
							onFalse: () =>
								fs.writeFileString(document.path, next).pipe(
									Effect.mapError(
										mapPostProcessError(
											document.path,
											'Writing'
										)
									)
								),
							onTrue: () => Effect.void
						});
						return !unchanged;
					}),
				{ concurrency: docSet.concurrency }
			);

			return pipe(
				changed,
				Arr.reduce(
					0,
					(total, wasChanged) => total + (wasChanged ? 1 : 0)
				)
			);
		});

		const processStrategy = Effect.fn('DocPostProcessor.processStrategy')(
			function* (
				docSet: DocSetConfig,
				documents: ReadonlyArray<WrittenDocument>,
				strategy: PostProcessingStrategy
			) {
				return yield* Match.value(strategy).pipe(
					Match.tag(
						'RewriteDocsetWebLinksStrategy',
						() => rewriteDocsetWebLinks(docSet, documents)
					),
					Match.exhaustive
				);
			}
		);

		const process = Effect.fn('DocPostProcessor.process')(
			function* (
				docSet: DocSetConfig,
				documents: ReadonlyArray<WrittenDocument>
			) {
				const counts = yield* Effect.forEach(
					docSet.postProcessingStrategies,
					(strategy) => processStrategy(docSet, documents, strategy),
					{ concurrency: 1 }
				);

				return pipe(
					counts,
					Arr.reduce(0, (total, count) => total + count)
				);
			}
		);

		return DocPostProcessor.of({ process });
	})
);

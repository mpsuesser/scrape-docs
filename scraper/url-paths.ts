import { Array as Arr, Effect, Path, Schema, String as Str } from 'effect';
import { pipe } from 'effect/Function';
import * as Option from 'effect/Option';

import { InvalidDocUrlError } from './errors.ts';
import { type DocPage, type DocSetConfig } from './model.ts';

export const decodeUrl = (
	url: string
): Effect.Effect<URL, InvalidDocUrlError> =>
	Schema.decodeUnknownEffect(Schema.URLFromString)(url).pipe(
		Effect.mapError(
			(cause) =>
				new InvalidDocUrlError({
					url,
					message: `Invalid documentation URL: ${url}`,
					cause
				})
		)
	);

export const markdownUrlFor = (
	url: string
): Effect.Effect<string, InvalidDocUrlError> =>
	Effect.gen(function* () {
		const parsed = yield* decodeUrl(url);
		const pathname = parsed.pathname;
		const normalizedPathname = Str.endsWith('/')(pathname)
			? pipe(pathname, Str.slice(0, -1))
			: pathname;

		if (Str.isEmpty(normalizedPathname)) {
			return yield* new InvalidDocUrlError({
				url,
				message: `Cannot append .md to empty URL pathname: ${url}`
			});
		}

		parsed.pathname = Str.endsWith('.md')(normalizedPathname)
			? normalizedPathname
			: `${normalizedPathname}.md`;
		return parsed.toString();
	});

const markdownFileSegment = (segment: string): string =>
	Str.endsWith('.md')(segment) ? segment : `${segment}.md`;

const outputPathFromSegments = (
	path: Path.Path,
	docSet: DocSetConfig,
	page: DocPage,
	segments: ReadonlyArray<string>
): Effect.Effect<string, InvalidDocUrlError> =>
	Arr.match(segments, {
		onEmpty: () =>
			Effect.fail(
				new InvalidDocUrlError({
					url: page.url,
					message:
						`Cannot map root URL to a markdown file: ${page.url}`
				})
			),
		onNonEmpty: (nonEmptySegments) => {
			const directorySegments = Arr.initNonEmpty(nonEmptySegments);
			const fileSegment = markdownFileSegment(
				Arr.lastNonEmpty(nonEmptySegments)
			);
			return Effect.succeed(
				path.join(
					docSet.outputDirectory,
					...directorySegments,
					fileSegment
				)
			);
		}
	});

const outputPathFromRelativePath = (
	path: Path.Path,
	docSet: DocSetConfig,
	page: DocPage,
	relativePath: string
): Effect.Effect<string, InvalidDocUrlError> =>
	Effect.gen(function* () {
		if (Str.startsWith('/')(relativePath)) {
			return yield* new InvalidDocUrlError({
				url: page.url,
				message: `Output path must be relative: ${relativePath}`
			});
		}

		const segments = pipe(
			Str.split(relativePath, '/'),
			Arr.filter(Str.isNonEmpty)
		);

		if (
			Arr.some(segments, (segment) => segment === '.' || segment === '..')
		) {
			return yield* new InvalidDocUrlError({
				url: page.url,
				message:
					`Output path cannot contain relative segments: ${relativePath}`
			});
		}

		return yield* outputPathFromSegments(path, docSet, page, segments);
	});

const outputPathFromUrl = (
	path: Path.Path,
	docSet: DocSetConfig,
	page: DocPage
): Effect.Effect<string, InvalidDocUrlError> =>
	Effect.gen(function* () {
		const parsed = yield* decodeUrl(page.url);
		const segments = pipe(
			Str.split(parsed.pathname, '/'),
			Arr.filter(Str.isNonEmpty)
		);

		return yield* outputPathFromSegments(path, docSet, page, segments);
	});

export const pageOutputPath = (
	path: Path.Path,
	docSet: DocSetConfig,
	page: DocPage
): Effect.Effect<string, InvalidDocUrlError> =>
	Option.match(page.outputPath, {
		onNone: () => outputPathFromUrl(path, docSet, page),
		onSome: (relativePath) =>
			outputPathFromRelativePath(path, docSet, page, relativePath)
	});

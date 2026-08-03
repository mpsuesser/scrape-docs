import {
	Array as Arr,
	Context,
	Effect,
	Layer,
	Order,
	Schema,
	String as Str
} from 'effect';
import { pipe } from 'effect/Function';
import * as Option from 'effect/Option';

import {
	GithubMarkdownDirectoryIndexParseError,
	HttpFetchError
} from './errors.ts';
import { HttpText } from './http-text.ts';
import { DocPage, type GithubMarkdownDirectoryIndexStrategy } from './model.ts';
import { decodeUrl } from './url-paths.ts';

class GithubDirectorySpec extends Schema.Class<GithubDirectorySpec>(
	'GithubDirectorySpec'
)({
	owner: Schema.NonEmptyString,
	repo: Schema.NonEmptyString,
	ref: Schema.NonEmptyString,
	rootPath: Schema.NonEmptyString
}) {}

class GithubTreeEntry extends Schema.Class<GithubTreeEntry>(
	'GithubTreeEntry'
)({
	path: Schema.String,
	type: Schema.String
}) {}

class GithubTreeResponse extends Schema.Class<GithubTreeResponse>(
	'GithubTreeResponse'
)({
	tree: Schema.Array(GithubTreeEntry),
	truncated: Schema.Boolean
}) {}

const GithubTreeResponseJson = Schema.fromJsonString(GithubTreeResponse);
const decodeGithubTreeResponse = Schema.decodeUnknownEffect(
	GithubTreeResponseJson
);

const githubTreePath = /^\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/;

const group = (match: RegExpMatchArray, index: number) =>
	Option.fromNullishOr(match[index]);

const parseGithubDirectoryUrl = Effect.fn(
	'GithubMarkdownDirectoryIndexReader.parseGithubDirectoryUrl'
)(function* (url: string) {
	const parsed = yield* decodeUrl(url).pipe(
		Effect.mapError(
			(cause) =>
				new GithubMarkdownDirectoryIndexParseError({
					url,
					message:
						`Invalid GitHub documentation directory URL: ${url}`,
					cause
				})
		)
	);

	if (parsed.hostname !== 'github.com') {
		return yield* new GithubMarkdownDirectoryIndexParseError({
			url,
			message: `Expected a github.com tree URL: ${url}`
		});
	}

	return yield* pipe(
		parsed.pathname,
		Str.match(githubTreePath),
		Option.flatMap((match) =>
			pipe(
				Option.Do,
				Option.bind('owner', () => group(match, 1)),
				Option.bind('repo', () => group(match, 2)),
				Option.bind('ref', () => group(match, 3)),
				Option.bind('rootPath', () => group(match, 4)),
				Option.map(
					({ owner, ref, repo, rootPath }) =>
						new GithubDirectorySpec({
							owner,
							ref,
							repo,
							rootPath
						})
				)
			)
		),
		Option.match({
			onNone: () =>
				Effect.fail(
					new GithubMarkdownDirectoryIndexParseError({
						url,
						message:
							`Expected a GitHub directory URL shaped like https://github.com/<owner>/<repo>/tree/<ref>/<path>: ${url}`
					})
				),
			onSome: Effect.succeed
		})
	);
});

const encodePath = (path: string): string =>
	pipe(
		Str.split(path, '/'),
		Arr.filter(Str.isNonEmpty),
		Arr.map(globalThis.encodeURIComponent),
		Arr.join('/')
	);

const githubTreeApiUrl = (spec: GithubDirectorySpec): string =>
	`https://api.github.com/repos/${spec.owner}/${spec.repo}/git/trees/${
		globalThis.encodeURIComponent(spec.ref)
	}?recursive=1`;

const rawGithubUrl = (spec: GithubDirectorySpec, path: string): string =>
	`https://raw.githubusercontent.com/${spec.owner}/${spec.repo}/${
		globalThis.encodeURIComponent(spec.ref)
	}/${encodePath(path)}`;

const relativePathFor = (
	spec: GithubDirectorySpec,
	path: string
): Option.Option<string> => {
	const prefix = `${spec.rootPath}/`;
	return Str.startsWith(prefix)(path)
		? Option.some(pipe(path, Str.slice(prefix.length)))
		: Option.none();
};

const isMarkdownSourcePath = (path: string): boolean =>
	Str.endsWith('.md')(path) || Str.endsWith('.mdx')(path);

const markdownOutputRelativePath = (relativePath: string): string =>
	pipe(relativePath, Str.replace(/\.mdx$/, '.md'));

const titleFromRelativePath = (relativePath: string): string =>
	pipe(
		Str.split(relativePath, '/'),
		Arr.match({
			onEmpty: () => relativePath,
			onNonEmpty: Arr.lastNonEmpty
		}),
		Str.replace(/\.mdx?$/, ''),
		Str.replaceAll('-', ' '),
		Str.replaceAll('_', ' '),
		Str.split(' '),
		Arr.filter(Str.isNonEmpty),
		Arr.map(Str.capitalize),
		Arr.join(' ')
	);

const byPath = Order.mapInput(
	Order.String,
	(entry: GithubTreeEntry) => entry.path
);

const parseGithubTree = (
	indexUrl: string,
	spec: GithubDirectorySpec,
	body: string
): Effect.Effect<
	ReadonlyArray<DocPage>,
	GithubMarkdownDirectoryIndexParseError
> => Effect.gen(function* () {
	const response = yield* decodeGithubTreeResponse(body).pipe(
		Effect.mapError(
			(cause) =>
				new GithubMarkdownDirectoryIndexParseError({
					url: indexUrl,
					message:
						`Could not decode GitHub tree response for ${indexUrl}`,
					cause
				})
		)
	);

	if (response.truncated) {
		return yield* new GithubMarkdownDirectoryIndexParseError({
			url: indexUrl,
			message:
				`GitHub tree response for ${indexUrl} was truncated; refusing to scrape an incomplete docset`
		});
	}

	const markdownPaths = pipe(
		response.tree,
		Arr.filter((entry) => entry.type === 'blob'),
		Arr.filter((entry) => isMarkdownSourcePath(entry.path)),
		Arr.sort(byPath),
		Arr.flatMap((entry) =>
			pipe(
				relativePathFor(spec, entry.path),
				Option.match({
					onNone: () => [],
					onSome: (relativePath) => [relativePath]
				})
			)
		)
	);

	return yield* Arr.match(markdownPaths, {
		onEmpty: () =>
			Effect.fail(
				new GithubMarkdownDirectoryIndexParseError({
					url: indexUrl,
					message:
						`No markdown files were found under ${spec.rootPath} in ${indexUrl}`
				})
			),
		onNonEmpty: (nonEmptyMarkdownPaths) =>
			Effect.succeed(
				pipe(
					nonEmptyMarkdownPaths,
					Arr.map((relativePath) => {
						const outputPath = markdownOutputRelativePath(
							relativePath
						);
						return new DocPage({
							description: '',
							outputPath: Option.some(outputPath),
							title: titleFromRelativePath(relativePath),
							url: rawGithubUrl(
								spec,
								`${spec.rootPath}/${relativePath}`
							)
						});
					})
				)
			)
	});
});

export class GithubMarkdownDirectoryIndexReader extends Context.Service<
	GithubMarkdownDirectoryIndexReader,
	{
		readonly load: (
			url: string,
			strategy: GithubMarkdownDirectoryIndexStrategy
		) => Effect.Effect<
			ReadonlyArray<DocPage>,
			HttpFetchError | GithubMarkdownDirectoryIndexParseError
		>;
	}
>()('@mydb/scripts/scraper/GithubMarkdownDirectoryIndexReader') {}

export const GithubMarkdownDirectoryIndexReaderLayer: Layer.Layer<
	GithubMarkdownDirectoryIndexReader,
	never,
	HttpText
> = Layer.effect(
	GithubMarkdownDirectoryIndexReader,
	Effect.gen(function* () {
		const http = yield* HttpText;

		const load = Effect.fn('GithubMarkdownDirectoryIndexReader.load')(
			function* (
				url: string,
				_strategy: GithubMarkdownDirectoryIndexStrategy
			) {
				const spec = yield* parseGithubDirectoryUrl(url);
				const body = yield* http.get(githubTreeApiUrl(spec));
				return yield* parseGithubTree(url, spec, body);
			}
		);

		return GithubMarkdownDirectoryIndexReader.of({ load });
	})
);

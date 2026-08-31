import {
	Array as Arr,
	Boolean as Bool,
	Context,
	Effect,
	Layer,
	Match,
	String as Str
} from 'effect';
import { pipe } from 'effect/Function';

import { DefuddleExtractor } from './defuddle-extractor.ts';
import { AllContentStrategiesFailed, PageContentError } from './errors.ts';
import { HttpText } from './http-text.ts';
import {
	ContentStrategy,
	type DefuddleStrategy,
	type DirectUrlStrategy,
	PageContent,
	type DocPage,
	type SourceUrlStrategy
} from './model.ts';
import { markdownUrlFor } from './url-paths.ts';

const requireNonEmptyBody = (
	url: string,
	strategy: string,
	body: string
): Effect.Effect<PageContent, PageContentError> =>
	Effect.gen(function* () {
		const trimmed = Str.trim(redactKnownExampleCredentials(body));
		return yield* Bool.match(Str.isNonEmpty(trimmed), {
			onFalse: () =>
				Effect.fail(
					new PageContentError({
						url,
						strategy,
						message: `${strategy} produced empty content for ${url}`
					})
				),
			onTrue: () =>
				Effect.succeed(
					new PageContent({
						body: trimmed,
						strategy,
						sourceUrl: url
					})
				)
		});
	});

export const redactKnownExampleCredentials = (body: string): string =>
	body
		.replace(
			/pscale_oauth_(refresh_)?[A-Za-z0-9_-]{20,}/g,
			(_token, refresh: string | undefined) =>
				refresh === undefined
					? '<PLANETSCALE_OAUTH_ACCESS_TOKEN>'
					: '<PLANETSCALE_OAUTH_REFRESH_TOKEN>'
		)
		.replace(
			/pscale_pw_[A-Za-z0-9_-]{20,}/g,
			'pscale_pw_<PLANETSCALE_DATABASE_PASSWORD>'
		);

const unsupportedMdx =
	/<[A-Z][A-Za-z]*\b|src=\{__img\d+\}|^import .+ from ['"]@theme\/|^export const \w+\s*=.*=>\s*\{/m;
const fencedCodeBlock = /^(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?^\1\s*$/gm;

export const isStandaloneMarkdown = (body: string): boolean =>
	!unsupportedMdx.test(body.replace(fencedCodeBlock, ''));

const platformAvailabilityDefinition =
	/^export const PlatformAvailability\s*=\s*\([\s\S]*?^};\s*/m;
const platformAvailabilityUsage = /<PlatformAvailability\b([^>]*)\/>/g;

const componentAttribute = (attributes: string, name: string): string | undefined =>
	new RegExp(`\\b${name}=["']([^"']+)["']`).exec(attributes)?.[1];

export const normalizeMintlifyMarkdown = (body: string): string =>
	body
		.replace(platformAvailabilityDefinition, '')
		.replace(platformAvailabilityUsage, (_match, attributes: string) => {
			const current = componentAttribute(attributes, 'current');
			const vitess = componentAttribute(attributes, 'vitess');
			const postgres = componentAttribute(attributes, 'postgres');
			if (current === 'both') {
				return '**Platform availability:** Vitess and Postgres';
			}
			const entries = [
				current === 'vitess'
					? 'Vitess'
					: vitess === undefined
						? undefined
						: `[Vitess](${vitess})`,
				current === 'postgres'
					? 'Postgres'
					: postgres === undefined
						? undefined
						: `[Postgres](${postgres})`
			].filter((entry): entry is string => entry !== undefined);
			return `**Platform availability:** ${entries.join(' and ')}${entries.length === 1 ? ' only' : ''}`;
		});

const dedent = (body: string): string => {
	const lines = body.replace(/^\s*\n|\n\s*$/g, '').split(/\r?\n/);
	const indentation = Math.min(
		...lines
			.filter((line) => line.trim().length > 0)
			.map((line) => /^\s*/.exec(line)?.[0].length ?? 0)
	);
	return lines.map((line) => line.slice(indentation)).join('\n');
};

const componentValue = (attributes: string): string =>
	componentAttribute(attributes, 'label') ??
	componentAttribute(attributes, 'value') ??
	'Example';

export const normalizeBetterAuthMarkdown = (body: string): string =>
	body
		.replace(
			/^[ \t]*<Step\b[^>]*>\s*\n\s*([^\r\n]+)([\s\S]*?)^[ \t]*<\/Step>/gm,
			(_match, title: string, content: string) => {
				const normalizedContent = dedent(content).replace(
					/^[ \t]*([^\r\n]+?)\s+\[#[^\]]+\]\s*$/gm,
					'#### $1'
				);
				return `### ${title.trim().replace(/\s+\[#[^\]]+\]\s*$/, '')}\n${normalizedContent}`;
			}
		)
		.replace(
			/^[ \t]*<CodeBlockTabsList\b[^>]*>[\s\S]*?<\/CodeBlockTabsList>/gm,
			''
		)
		.replace(
			/^[ \t]*<CodeBlockTab\b([^>]*)>([\s\S]*?)^[ \t]*<\/CodeBlockTab>/gm,
			(_match, attributes: string, content: string) =>
				`#### ${componentValue(attributes)}\n\n${dedent(content)}`
		)
		.replace(
			/^[ \t]*<Tab\b([^>]*)>([\s\S]*?)^[ \t]*<\/Tab>/gm,
			(_match, attributes: string, content: string) =>
				`#### ${componentValue(attributes)}\n\n${dedent(content)}`
		)
		.replace(
			/^[ \t]*<Callout\b[^>]*>([\s\S]*?)^[ \t]*<\/Callout>/gm,
			(_match, content: string) =>
				dedent(content)
					.split(/\r?\n/)
					.map((line) => `> ${line}`)
					.join('\n')
		)
		.replace(/^[ \t]*<\/?(?:Steps|CodeBlockTabs|Tabs)\b[^>]*>[ \t]*$/gm, '')
		.replace(/<ForkButton\b[^>]*\burl=["']([^"']+)["'][^>]*\/>/g, (_match, url: string) =>
			`[View example on GitHub](https://github.com/${url})`
		)
		.replace(
			/<iframe\b([\s\S]*?)\/>/g,
			(_match, attributes: string) => {
				const src = componentAttribute(attributes, 'src');
				if (src === undefined) {
					return '';
				}
				const title = componentAttribute(attributes, 'title') ?? 'Interactive example';
				return `[${title}](${src})`;
			}
		)
		.replace(/^[ \t]*([^\r\n]+?)\s+\[#[^\]]+\]\s*$/gm, '## $1');

const docusaurusDirective =
	/^:::(important|info|tip|warning|note|caution|danger)(?:[ \t]+([^\r\n]+))?\r?\n([\s\S]*?)^:::\s*$/gm;

const normalizeDocusaurusDirectives = (body: string): string =>
	body.replace(
		docusaurusDirective,
		(_match, type: string, title: string | undefined, content: string) => {
			const label = title ?? `${type[0]?.toUpperCase() ?? ''}${type.slice(1)}`;
			const quotedContent = content
				.trimEnd()
				.split(/\r?\n/)
				.map((line) => `> ${line}`)
				.join('\n');
			return `> **${label}:**\n>\n${quotedContent}`;
		}
	);

export const normalizeDocusaurusMarkdown = (body: string): string => {
	if (!/^import Tabs from ['"]@theme\/Tabs['"];?$/m.test(body)) {
		return normalizeDocusaurusDirectives(body);
	}
	return normalizeDocusaurusDirectives(pipe(
		body,
		Str.replaceAll(/^import (?:Tabs|TabItem) from .+;?\r?\n/gm, ''),
		Str.replaceAll(/^<\/?Tabs>\r?\n?/gm, ''),
		Str.replaceAll(
			/^<TabItem\b[^>]*\blabel=["']([^"']+)["'][^>]*>$/gm,
			'#### $1'
		),
		Str.replaceAll(/^<\/TabItem>\r?\n?/gm, '')
	));
};

const strategyName = (strategy: ContentStrategy): string =>
	Match.value(strategy).pipe(
		Match.tag('MarkdownUrlStrategy', () => 'MarkdownUrlStrategy'),
		Match.tag('DirectUrlStrategy', () => 'DirectUrlStrategy'),
		Match.tag('SourceUrlStrategy', () => 'SourceUrlStrategy'),
		Match.tag('DefuddleStrategy', () => 'DefuddleStrategy'),
		Match.exhaustive
	);

const replaceUrlPrefix = (
	url: string,
	replacements: ReadonlyArray<{ readonly from: string; readonly to: string }>
): string => {
	const replacement = replacements.find(({ from }) => url.startsWith(from));
	return replacement === undefined
		? url
		: `${replacement.to}${url.slice(replacement.from.length)}`;
};

export class PageContentLoader extends Context.Service<
	PageContentLoader,
	{
		readonly load: (
			page: DocPage,
			strategies: ReadonlyArray<ContentStrategy>
		) => Effect.Effect<PageContent, AllContentStrategiesFailed>;
	}
>()('@mydb/scraper/PageContentLoader') {}

export const PageContentLoaderLayer: Layer.Layer<
	PageContentLoader,
	never,
	HttpText | DefuddleExtractor
> = Layer.effect(
	PageContentLoader,
	Effect.gen(function* () {
		const http = yield* HttpText;
		const defuddle = yield* DefuddleExtractor;

		const loadMarkdownUrl = Effect.fn('PageContentLoader.loadMarkdownUrl')(
			function* (page: DocPage) {
				const markdownUrl = yield* markdownUrlFor(page.url).pipe(
					Effect.mapError(
						(cause) =>
							new PageContentError({
								url: page.url,
								strategy: 'MarkdownUrlStrategy',
								message: cause.message,
								cause
							})
					)
				);
				const fetchedBody = yield* http.get(markdownUrl).pipe(
					Effect.mapError(
						(cause) =>
							new PageContentError({
								url: page.url,
								strategy: 'MarkdownUrlStrategy',
								message: cause.message,
								cause
							})
					)
				);
				const body = normalizeMintlifyMarkdown(fetchedBody);
				if (!isStandaloneMarkdown(body)) {
					return yield* new PageContentError({
						url: markdownUrl,
						strategy: 'MarkdownUrlStrategy',
						message: `Markdown payload contains unresolved MDX for ${markdownUrl}`
					});
				}
				return yield* requireNonEmptyBody(
					markdownUrl,
					'MarkdownUrlStrategy',
					body
				);
			}
		);

		const loadDirectUrl = Effect.fn('PageContentLoader.loadDirectUrl')(
			function* (page: DocPage, strategy: DirectUrlStrategy) {
				const fetchedBody = yield* http.get(page.url).pipe(
					Effect.mapError(
						(cause) =>
							new PageContentError({
								url: page.url,
								strategy: 'DirectUrlStrategy',
								message: cause.message,
								cause
							})
					)
				);
				const docusaurusBody = normalizeDocusaurusMarkdown(fetchedBody);
				const body = strategy.normalizeMdx
					? normalizeBetterAuthMarkdown(docusaurusBody)
					: docusaurusBody;
				if (strategy.normalizeMdx && !isStandaloneMarkdown(body)) {
					return yield* new PageContentError({
						url: page.url,
						strategy: 'DirectUrlStrategy',
						message: `Direct payload contains unresolved MDX for ${page.url}`
					});
				}
				return yield* requireNonEmptyBody(
					page.url,
					'DirectUrlStrategy',
					body
				);
			}
		);

		const loadSourceUrl = Effect.fn('PageContentLoader.loadSourceUrl')(
			function* (page: DocPage, strategy: SourceUrlStrategy) {
				const source = strategy.sources.find(
					(candidate) => candidate.pageUrl === page.url
				);
				if (source === undefined) {
					return yield* new PageContentError({
						url: page.url,
						strategy: 'SourceUrlStrategy',
						message: `No source URL configured for ${page.url}`
					});
				}
				const fetchedBody = yield* http.get(source.sourceUrl).pipe(
					Effect.mapError(
						(cause) =>
							new PageContentError({
								url: source.sourceUrl,
								strategy: 'SourceUrlStrategy',
								message: cause.message,
								cause
							})
					)
				);
				const body = normalizeDocusaurusMarkdown(fetchedBody);
				if (!isStandaloneMarkdown(body)) {
					return yield* new PageContentError({
						url: source.sourceUrl,
						strategy: 'SourceUrlStrategy',
						message: `Source payload contains unresolved MDX for ${source.sourceUrl}`
					});
				}
				return yield* requireNonEmptyBody(
					source.sourceUrl,
					'SourceUrlStrategy',
					body
				);
			}
		);

		const loadDefuddle = Effect.fn('PageContentLoader.loadDefuddle')(
			function* (page: DocPage, strategy: DefuddleStrategy) {
				const sourceUrl = replaceUrlPrefix(
					page.url,
					strategy.urlPrefixReplacements
				);
				const html = yield* http
					.get(sourceUrl, 'text/html, application/xhtml+xml;q=0.9')
					.pipe(
						Effect.mapError(
							(cause) =>
								new PageContentError({
									url: sourceUrl,
									strategy: 'DefuddleStrategy',
									message: cause.message,
									cause
								})
						)
					);
				const markdown = yield* defuddle.extractMarkdown(
					sourceUrl,
					html
				);
				return yield* requireNonEmptyBody(
					sourceUrl,
					'DefuddleStrategy',
					markdown
				);
			}
		);

		const loadWithStrategy = Effect.fn(
			'PageContentLoader.loadWithStrategy'
		)(
			function* (page: DocPage, strategy: ContentStrategy) {
				return yield* Match.value(strategy).pipe(
					Match.tag(
						'MarkdownUrlStrategy',
						() => loadMarkdownUrl(page)
					),
					Match.tag('DirectUrlStrategy', (directStrategy) =>
						loadDirectUrl(page, directStrategy)
					),
					Match.tag('SourceUrlStrategy', (sourceStrategy) =>
						loadSourceUrl(page, sourceStrategy)
					),
					Match.tag('DefuddleStrategy', (defuddleStrategy) =>
						loadDefuddle(page, defuddleStrategy)
					),
					Match.exhaustive
				);
			}
		);

		const tryStrategies = (
			page: DocPage,
			strategies: ReadonlyArray<ContentStrategy>,
			failures: ReadonlyArray<string>
		): Effect.Effect<PageContent, AllContentStrategiesFailed> =>
			Arr.match(strategies, {
				onEmpty: () =>
					Effect.fail(
						new AllContentStrategiesFailed({
							url: page.url,
							message:
								`No content strategy succeeded for ${page.url}`,
							failures
						})
					),
				onNonEmpty: (remainingStrategies) => {
					const strategy = Arr.headNonEmpty(remainingStrategies);
					const remaining = Arr.tailNonEmpty(remainingStrategies);
					return loadWithStrategy(page, strategy).pipe(
						Effect.catchTag(
							'PageContentError',
							(error) =>
								tryStrategies(
									page,
									remaining,
									pipe(
										failures,
										Arr.append(
											`${
												strategyName(strategy)
											}: ${error.message}`
										)
									)
								)
						)
					);
				}
			});

		const load = Effect.fn('PageContentLoader.load')(
			function* (
				page: DocPage,
				strategies: ReadonlyArray<ContentStrategy>
			) {
				return yield* tryStrategies(page, strategies, []);
			}
		);

		return PageContentLoader.of({ load });
	})
);

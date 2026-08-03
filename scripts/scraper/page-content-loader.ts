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
import { ContentStrategy, PageContent, type DocPage } from './model.ts';
import { markdownUrlFor } from './url-paths.ts';

const requireNonEmptyBody = (
	url: string,
	strategy: string,
	body: string
): Effect.Effect<PageContent, PageContentError> =>
	Effect.gen(function* () {
		const trimmed = Str.trim(body);
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

const strategyName = (strategy: ContentStrategy): string =>
	Match.value(strategy).pipe(
		Match.tag('MarkdownUrlStrategy', () => 'MarkdownUrlStrategy'),
		Match.tag('DirectUrlStrategy', () => 'DirectUrlStrategy'),
		Match.tag('DefuddleStrategy', () => 'DefuddleStrategy'),
		Match.exhaustive
	);

export class PageContentLoader extends Context.Service<
	PageContentLoader,
	{
		readonly load: (
			page: DocPage,
			strategies: ReadonlyArray<ContentStrategy>
		) => Effect.Effect<PageContent, AllContentStrategiesFailed>;
	}
>()('@mydb/scripts/scraper/PageContentLoader') {}

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
				const body = yield* http.get(markdownUrl).pipe(
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
				return yield* requireNonEmptyBody(
					markdownUrl,
					'MarkdownUrlStrategy',
					body
				);
			}
		);

		const loadDirectUrl = Effect.fn('PageContentLoader.loadDirectUrl')(
			function* (page: DocPage) {
				const body = yield* http.get(page.url).pipe(
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
				return yield* requireNonEmptyBody(
					page.url,
					'DirectUrlStrategy',
					body
				);
			}
		);

		const loadDefuddle = Effect.fn('PageContentLoader.loadDefuddle')(
			function* (page: DocPage) {
				const html = yield* http.get(page.url).pipe(
					Effect.mapError(
						(cause) =>
							new PageContentError({
								url: page.url,
								strategy: 'DefuddleStrategy',
								message: cause.message,
								cause
							})
					)
				);
				const markdown = yield* defuddle.extractMarkdown(
					page.url,
					html
				);
				return yield* requireNonEmptyBody(
					page.url,
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
					Match.tag('DirectUrlStrategy', () => loadDirectUrl(page)),
					Match.tag('DefuddleStrategy', () => loadDefuddle(page)),
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

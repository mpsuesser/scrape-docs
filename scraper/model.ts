import { Effect, Schema } from 'effect';
import * as Option from 'effect/Option';

export class LlmsTxtIndexStrategy
	extends Schema.Class<LlmsTxtIndexStrategy>('LlmsTxtIndexStrategy')({
		_tag: Schema.tag('LlmsTxtIndexStrategy'),
		excludeUrls: Schema.Array(Schema.NonEmptyString).pipe(
			Schema.withConstructorDefault(Effect.succeed([]))
		)
	})
{}

export class UrlPrefixReplacement
	extends Schema.Class<UrlPrefixReplacement>('UrlPrefixReplacement')({
		from: Schema.NonEmptyString,
		to: Schema.NonEmptyString
	})
{}

export class SitemapIndexStrategy
	extends Schema.Class<SitemapIndexStrategy>('SitemapIndexStrategy')({
		_tag: Schema.tag('SitemapIndexStrategy'),
		includeUrlPrefixes: Schema.Array(Schema.NonEmptyString),
		outputPathUrlPrefix: Schema.OptionFromOptionalKey(
			Schema.NonEmptyString
		).pipe(Schema.withConstructorDefault(Effect.succeed(Option.none()))),
		urlPrefixReplacements: Schema.Array(UrlPrefixReplacement).pipe(
			Schema.withConstructorDefault(Effect.succeed([]))
		)
	})
{}

export class GithubMarkdownDirectoryIndexStrategy
	extends Schema.Class<GithubMarkdownDirectoryIndexStrategy>(
		'GithubMarkdownDirectoryIndexStrategy'
	)({
		_tag: Schema.tag('GithubMarkdownDirectoryIndexStrategy')
	})
{}

export const DocIndexStrategy = Schema.Union([
	LlmsTxtIndexStrategy,
	SitemapIndexStrategy,
	GithubMarkdownDirectoryIndexStrategy
]).pipe(Schema.toTaggedUnion('_tag'));
export type DocIndexStrategy = typeof DocIndexStrategy.Type;

export class MarkdownUrlStrategy
	extends Schema.Class<MarkdownUrlStrategy>('MarkdownUrlStrategy')({
		_tag: Schema.tag('MarkdownUrlStrategy')
	})
{}

export class DirectUrlStrategy
	extends Schema.Class<DirectUrlStrategy>('DirectUrlStrategy')({
		_tag: Schema.tag('DirectUrlStrategy'),
		normalizeMdx: Schema.Boolean.pipe(
			Schema.withConstructorDefault(Effect.succeed(false))
		)
	})
{}

export class PageSource extends Schema.Class<PageSource>('PageSource')({
	pageUrl: Schema.NonEmptyString,
	sourceUrl: Schema.NonEmptyString
}) {}

export class SourceUrlStrategy
	extends Schema.Class<SourceUrlStrategy>('SourceUrlStrategy')({
		_tag: Schema.tag('SourceUrlStrategy'),
		sources: Schema.NonEmptyArray(PageSource)
	})
{}

export class DefuddleStrategy
	extends Schema.Class<DefuddleStrategy>('DefuddleStrategy')({
		_tag: Schema.tag('DefuddleStrategy'),
		urlPrefixReplacements: Schema.Array(UrlPrefixReplacement).pipe(
			Schema.withConstructorDefault(Effect.succeed([]))
		)
	})
{}

export const ContentStrategy = Schema.Union([
	MarkdownUrlStrategy,
	DirectUrlStrategy,
	SourceUrlStrategy,
	DefuddleStrategy
]).pipe(Schema.toTaggedUnion('_tag'));
export type ContentStrategy = typeof ContentStrategy.Type;

export class RewriteDocsetWebLinksStrategy
	extends Schema.Class<RewriteDocsetWebLinksStrategy>(
		'RewriteDocsetWebLinksStrategy'
	)({
		_tag: Schema.tag('RewriteDocsetWebLinksStrategy'),
		urlPrefixReplacements: Schema.Array(UrlPrefixReplacement).pipe(
			Schema.withConstructorDefault(Effect.succeed([]))
		)
	})
{}

export const PostProcessingStrategy = Schema.Union([
	RewriteDocsetWebLinksStrategy
]).pipe(Schema.toTaggedUnion('_tag'));
export type PostProcessingStrategy = typeof PostProcessingStrategy.Type;

export class DocPage extends Schema.Class<DocPage>('DocPage')(
	{
		title: Schema.NonEmptyString,
		url: Schema.NonEmptyString,
		description: Schema.String,
		outputPath: Schema.OptionFromOptionalKey(Schema.NonEmptyString).pipe(
			Schema.withConstructorDefault(Effect.succeed(Option.none()))
		)
	},
	{
		description:
			'One documentation page discovered from a documentation index.'
	}
) {}

export class DocSetConfig extends Schema.Class<DocSetConfig>('DocSetConfig')(
	{
		name: Schema.NonEmptyString,
		indexUrl: Schema.NonEmptyString,
		indexStrategy: DocIndexStrategy,
		outputDirectory: Schema.NonEmptyString,
		contentStrategies: Schema.NonEmptyArray(ContentStrategy),
		postProcessingStrategies: Schema.Array(PostProcessingStrategy).pipe(
			Schema.withConstructorDefault(Effect.succeed([]))
		),
		concurrency: Schema.Number.check(
			Schema.isInt({
				identifier: 'DocSetConfigConcurrencyInt',
				title: 'DocSetConfig concurrency integer',
				description: 'Doc scraper concurrency must be an integer.'
			}),
			Schema.isGreaterThanOrEqualTo(1, {
				identifier: 'DocSetConfigConcurrencyMinimum',
				title: 'DocSetConfig concurrency minimum',
				description: 'Doc scraper concurrency must be at least one.'
			})
		),
		cleanOutputDirectory: Schema.Boolean
	},
	{ description: 'Configuration for scraping one documentation docset.' }
) {}

export class PageContent extends Schema.Class<PageContent>('PageContent')({
	body: Schema.NonEmptyString,
	strategy: Schema.NonEmptyString,
	sourceUrl: Schema.NonEmptyString
}) {}

export class WrittenDocument extends Schema.Class<WrittenDocument>(
	'WrittenDocument'
)({
	url: Schema.NonEmptyString,
	path: Schema.NonEmptyString,
	strategy: Schema.NonEmptyString
}) {}

export class ScrapeSummary
	extends Schema.Class<ScrapeSummary>('ScrapeSummary')({
		docSetName: Schema.NonEmptyString,
		outputDirectory: Schema.NonEmptyString,
		pageCount: Schema.Number,
		writtenDocuments: Schema.Array(WrittenDocument)
	})
{}

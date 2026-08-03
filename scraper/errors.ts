import { Schema } from 'effect';

export class HttpFetchError extends Schema.TaggedErrorClass<HttpFetchError>()(
	'HttpFetchError',
	{
		url: Schema.String,
		message: Schema.String,
		cause: Schema.optionalKey(Schema.Unknown)
	},
	{ description: 'An HTTP request for documentation content failed.' }
) {}

export class LlmsIndexParseError
	extends Schema.TaggedErrorClass<LlmsIndexParseError>()(
		'LlmsIndexParseError',
		{
			url: Schema.String,
			message: Schema.String
		},
		{ description: 'An llms.txt index did not contain any page entries.' }
	)
{}

export class SitemapIndexParseError
	extends Schema.TaggedErrorClass<SitemapIndexParseError>()(
		'SitemapIndexParseError',
		{
			url: Schema.String,
			message: Schema.String
		},
		{
			description:
				'A sitemap index did not contain any matching page URLs.'
		}
	)
{}

export class GithubMarkdownDirectoryIndexParseError
	extends Schema.TaggedErrorClass<GithubMarkdownDirectoryIndexParseError>()(
		'GithubMarkdownDirectoryIndexParseError',
		{
			url: Schema.String,
			message: Schema.String,
			cause: Schema.optionalKey(Schema.Unknown)
		},
		{
			description:
				'A GitHub markdown directory index could not be parsed or did not contain matching markdown files.'
		}
	)
{}

export class PageContentError
	extends Schema.TaggedErrorClass<PageContentError>()(
		'PageContentError',
		{
			url: Schema.String,
			strategy: Schema.String,
			message: Schema.String,
			cause: Schema.optionalKey(Schema.Unknown)
		},
		{ description: 'One page-content extraction strategy failed.' }
	)
{}

export class AllContentStrategiesFailed
	extends Schema.TaggedErrorClass<AllContentStrategiesFailed>()(
		'AllContentStrategiesFailed',
		{
			url: Schema.String,
			message: Schema.String,
			failures: Schema.Array(Schema.String)
		},
		{ description: 'Every configured content extraction strategy failed.' }
	)
{}

export class InvalidDocUrlError
	extends Schema.TaggedErrorClass<InvalidDocUrlError>()(
		'InvalidDocUrlError',
		{
			url: Schema.String,
			message: Schema.String,
			cause: Schema.optionalKey(Schema.Unknown)
		},
		{
			description:
				'A documentation URL could not be mapped to a file path.'
		}
	)
{}

export class DocWriteError extends Schema.TaggedErrorClass<DocWriteError>()(
	'DocWriteError',
	{
		path: Schema.String,
		message: Schema.String,
		cause: Schema.optionalKey(Schema.Unknown)
	},
	{
		description:
			'A generated documentation markdown file could not be written.'
	}
) {}

export class DocPostProcessError
	extends Schema.TaggedErrorClass<DocPostProcessError>()(
		'DocPostProcessError',
		{
			path: Schema.String,
			message: Schema.String,
			cause: Schema.optionalKey(Schema.Unknown)
		},
		{
			description:
				'A generated documentation markdown file could not be post-processed.'
		}
	)
{}

import { Layer } from 'effect';

import { DefuddleExtractorLayer } from './defuddle-extractor.ts';
import { DocPostProcessorLayer } from './doc-post-processor.ts';
import { DocSetScraperLayer } from './doc-set-scraper.ts';
import { DocWriterLayer } from './doc-writer.ts';
import { GithubMarkdownDirectoryIndexReaderLayer } from './github-markdown-directory-index.ts';
import { HttpTextLayer } from './http-text.ts';
import { LlmsIndexReaderLayer } from './llms-index.ts';
import { PageContentLoaderLayer } from './page-content-loader.ts';
import { SitemapIndexReaderLayer } from './sitemap-index.ts';

export * from './defuddle-extractor.ts';
export * from './doc-post-processor.ts';
export * from './doc-set-scraper.ts';
export * from './doc-writer.ts';
export * from './errors.ts';
export * from './github-markdown-directory-index.ts';
export * from './http-text.ts';
export * from './llms-index.ts';
export * from './model.ts';
export * from './page-content-loader.ts';
export * from './sitemap-index.ts';
export * from './url-paths.ts';

const extractionSupportLayer = Layer.mergeAll(
	HttpTextLayer,
	DefuddleExtractorLayer
);

const readersLayer = Layer.mergeAll(
	GithubMarkdownDirectoryIndexReaderLayer,
	LlmsIndexReaderLayer,
	PageContentLoaderLayer,
	SitemapIndexReaderLayer
).pipe(Layer.provideMerge(extractionSupportLayer));

export const DocScraperLayer = DocSetScraperLayer.pipe(
	Layer.provide(
		Layer.mergeAll(readersLayer, DocPostProcessorLayer, DocWriterLayer)
	)
);

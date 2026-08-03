import { Defuddle } from 'defuddle/node';
import { parseHTML } from 'linkedom';

import { Context, Effect, Layer } from 'effect';

import { PageContentError } from './errors.ts';

type ParsedDocument = ReturnType<typeof parseHTML>['document'];

const preserveTabbedContent = (document: ParsedDocument): void => {
	for (const tabList of document.querySelectorAll('[role="tablist"]')) {
		const tabs = tabList.querySelectorAll('[role="tab"]');
		const labels: Array<string> = [];
		for (let index = 0; index < tabs.length; index += 1) {
			labels.push(tabs.item(index)?.textContent?.trim() ?? '');
		}
		const container = tabList.parentElement;
		const panels = container?.querySelectorAll('[role="tabpanel"]') ?? [];
		tabList.remove();
		for (let index = 0; index < panels.length; index += 1) {
			const panel = panels.item(index);
			if (panel === null) {
				continue;
			}
			panel.removeAttribute('hidden');
			const label = labels[index];
			if (label !== undefined && label.length > 0) {
				const heading = document.createElement('h4');
				heading.textContent = label;
				panel.prepend(heading);
			}
		}
	}
};

const normalizeAdmonitions = (document: ParsedDocument): void => {
	for (const admonition of document.querySelectorAll('.theme-admonition')) {
		const heading = admonition.querySelector('[class*="admonitionHeading"]');
		const content = admonition.querySelector('[class*="admonitionContent"]');
		const label = heading?.textContent?.trim();
		const blockquote = document.createElement('blockquote');
		if (label !== undefined && label.length > 0) {
			const labelParagraph = document.createElement('p');
			const strong = document.createElement('strong');
			strong.textContent = `${label[0]?.toUpperCase() ?? ''}${label.slice(1)}:`;
			labelParagraph.append(strong);
			blockquote.append(labelParagraph);
		}
		const contentRoot = content ?? admonition;
		for (const child of Array.from(contentRoot.childNodes)) {
			if (child === heading) {
				continue;
			}
			blockquote.append(child);
		}
		admonition.replaceWith(blockquote);
	}
};

const markUnavailableInteractiveContent = (document: ParsedDocument): void => {
	for (const island of document.querySelectorAll('astro-island')) {
		const pre = island.querySelector('pre');
		if (pre?.textContent?.trim() !== '$') {
			continue;
		}
		const marker = document.createElement('p');
		const emphasis = document.createElement('em');
		emphasis.textContent =
			'Interactive demonstration unavailable in static documentation.';
		marker.append(emphasis);
		island.replaceWith(marker);
	}
};

export const prepareDocumentForExtraction = (
	document: ParsedDocument
): ParsedDocument => {
	preserveTabbedContent(document);
	normalizeAdmonitions(document);
	markUnavailableInteractiveContent(document);
	return document;
};

export class DefuddleExtractor extends Context.Service<
	DefuddleExtractor,
	{
		readonly extractMarkdown: (
			url: string,
			html: string
		) => Effect.Effect<string, PageContentError>;
	}
>()('@mydb/scripts/scraper/DefuddleExtractor') {}

export const DefuddleExtractorLayer: Layer.Layer<DefuddleExtractor> = Layer
	.succeed(
		DefuddleExtractor,
		DefuddleExtractor.of({
			extractMarkdown: Effect.fn('DefuddleExtractor.extractMarkdown')(
				function* (url: string, html: string) {
					const parsed = yield* Effect.try({
						try: () =>
							prepareDocumentForExtraction(parseHTML(html).document),
						catch: (cause) =>
							new PageContentError({
								url,
								strategy: 'DefuddleStrategy',
								message: `Parsing HTML for ${url} failed`,
								cause
							})
					});

					const result = yield* Effect.tryPromise({
						try: () =>
							Defuddle(parsed, url, {
								markdown: true,
								useAsync: false
							}),
						catch: (cause) =>
							new PageContentError({
								url,
								strategy: 'DefuddleStrategy',
								message:
									`Defuddle extraction for ${url} failed`,
								cause
							})
					});

					return result.content;
				}
			)
		})
	);

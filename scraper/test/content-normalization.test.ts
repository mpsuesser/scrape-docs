import { assert, describe, it } from '@effect/vitest';

import { parseHTML } from 'linkedom';

import { prepareDocumentForExtraction } from '../defuddle-extractor.ts';
import {
	isStandaloneMarkdown,
	normalizeDocusaurusMarkdown
} from '../page-content-loader.ts';

describe('content normalization', () => {
	it('preserves every labeled tab panel for extraction', () => {
		const document = parseHTML(`
			<main>
				<div>
					<ul role="tablist"><li role="tab">main.js</li><li role="tab">renderer.js</li></ul>
					<div role="tabpanel"><pre>main</pre></div>
					<div role="tabpanel" hidden><pre>renderer</pre></div>
				</div>
			</main>
		`).document;

		prepareDocumentForExtraction(document);
		const output = document.toString();

		assert.include(output, '<h4>main.js</h4>');
		assert.include(output, '<h4>renderer.js</h4>');
		assert.notInclude(output, 'hidden');
		assert.notInclude(output, 'role="tablist"');
	});

	it('normalizes Docusaurus admonitions and empty interactive shells', () => {
		const document = parseHTML(`
			<main>
				<div class="theme-admonition"><div class="admonitionHeading_hash">tip</div><div class="admonitionContent_hash"><p>Useful detail.</p></div></div>
				<astro-island><pre><span>$ </span></pre></astro-island>
			</main>
		`).document;

		prepareDocumentForExtraction(document);
		const output = document.toString();

		assert.include(output, '<blockquote><p><strong>Tip:</strong></p><p>Useful detail.</p></blockquote>');
		assert.include(
			output,
			'<em>Interactive demonstration unavailable in static documentation.</em>'
		);
		assert.notInclude(output, '<astro-island>');
	});

	it('does not discard admonitions with unfamiliar markup', () => {
		const document = parseHTML(
			'<main><div class="theme-admonition"><p>Do not lose me.</p></div></main>'
		).document;

		prepareDocumentForExtraction(document);

		assert.include(
			document.toString(),
			'<blockquote><p>Do not lose me.</p></blockquote>'
		);
	});

	it('rejects unresolved Turborepo MDX so HTML extraction can run', () => {
		assert.isFalse(
			isStandaloneMarkdown('<PackageManagerTabs><Tab value="pnpm">x</Tab></PackageManagerTabs>')
		);
		assert.isFalse(isStandaloneMarkdown('<img src={__img0} />'));
		assert.isTrue(isStandaloneMarkdown('# Plain Markdown'));
	});

	it('converts Docusaurus tabs to labeled standalone sections', () => {
		const output = normalizeDocusaurusMarkdown(`import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
<TabItem value="cli" label="CLI" default>

\`\`\`go
package main
\`\`\`

</TabItem>
</Tabs>`);

		assert.notInclude(output, 'import Tabs');
		assert.notInclude(output, '<TabItem');
		assert.include(output, '#### CLI');
		assert.include(output, '```go');
	});

	it('converts Docusaurus directives to readable blockquotes', () => {
		const output = normalizeDocusaurusMarkdown(`:::important
Do not skip this.
:::

:::info Note
More context.
:::`);

		assert.include(output, '> **Important:**\n>\n> Do not skip this.');
		assert.include(output, '> **Note:**\n>\n> More context.');
		assert.notInclude(output, ':::');
	});
});

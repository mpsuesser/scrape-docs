import { assert, describe, it } from '@effect/vitest';

import { parseHTML } from 'linkedom';

import { prepareDocumentForExtraction } from '../defuddle-extractor.ts';
import {
	isStandaloneMarkdown,
	normalizeBetterAuthMarkdown,
	normalizeDocusaurusMarkdown,
	normalizeMintlifyMarkdown,
	redactKnownExampleCredentials
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

	it('converts PlanetScale platform components without leaking JSX', () => {
		const output = normalizeMintlifyMarkdown(`# Page

export const PlatformAvailability = ({current, vitess, postgres}) => {
  const docsHref = path => {
    if (!path) return path;
    return path.startsWith('/') ? path : \`/\${path}\`;
  };
  const engines = [current, vitess, postgres];
  return <div className="tailwind">{engines.map(engine => {
    return <span>{docsHref(engine)}</span>;
  })}</div>;
};

<PlatformAvailability current="both" />

Body`);

		assert.include(output, '**Platform availability:** Vitess and Postgres');
		assert.include(output, 'Body');
		assert.notInclude(output, 'export const PlatformAvailability');
		assert.notInclude(output, 'docsHref');
		assert.notInclude(output, 'engines.map');
		assert.notInclude(output, 'className=');
	});

	it('preserves linked alternatives in platform availability', () => {
		const output = normalizeMintlifyMarkdown(
			'<PlatformAvailability current="vitess" postgres="/docs/postgres" />'
		);

		assert.strictEqual(
			output,
			'**Platform availability:** Vitess and [Postgres](/docs/postgres)'
		);
	});

	it('rejects unfenced exported components that have no safe normalizer', () => {
		assert.isFalse(
			isStandaloneMarkdown('export const Widget = () => {\n  return <div />;\n};')
		);
		assert.isTrue(
			isStandaloneMarkdown('```ts\nexport const Widget = () => {\n  return 1;\n};\n```')
		);
	});

	it('converts Better Auth components while preserving every tab', () => {
		const output = normalizeBetterAuthMarkdown(`<Steps>
  <Step>
    Install packages [#install-packages]

    <CodeBlockTabs defaultValue="npm">
      <CodeBlockTabsList><CodeBlockTabsTrigger value="npm">npm</CodeBlockTabsTrigger></CodeBlockTabsList>
      <CodeBlockTab value="npm">
        \`\`\`bash
        npm install better-auth
        \`\`\`
      </CodeBlockTab>
      <CodeBlockTab value="pnpm">
        \`\`\`bash
        pnpm add better-auth
        \`\`\`
      </CodeBlockTab>
    </CodeBlockTabs>

    <Callout type="info">
      Keep this detail.
    </Callout>
  </Step>
</Steps>`);

		assert.include(output, '### Install packages');
		assert.include(output, '#### npm\n\n```bash\nnpm install better-auth');
		assert.include(output, '#### pnpm\n\n```bash\npnpm add better-auth');
		assert.include(output, '> Keep this detail.');
		assert.isTrue(isStandaloneMarkdown(output));
	});

	it('converts Better Auth interactive embeds to links', () => {
		const output = normalizeBetterAuthMarkdown(`<ForkButton url="better-auth/examples/tree/main/astro-example" />
<iframe
  src="https://example.com/demo"
  style={{ height: "500px" }}
  title="Demo"
/>`);

		assert.include(
			output,
			'[View example on GitHub](https://github.com/better-auth/examples/tree/main/astro-example)'
		);
		assert.include(output, '[Demo](https://example.com/demo)');
		assert.notInclude(output, '<iframe');
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

	it('redacts realistic PlanetScale example credentials', () => {
		const databasePassword = `pscale_${'pw'}_${'A'.repeat(32)}`;
		const output = redactKnownExampleCredentials(`{
  "access_token": "pscale_oauth_8zO_rNQCct1Uj8zkTWLh3kgwAqg8UabGIc43D2eINvo",
  "refresh_token": "pscale_oauth_refresh_W_zjmZ1a14sczj15bxJdsW_kiv063OrHG4CBh0IXR9M",
  "database_url": "postgresql://user:${databasePassword}@example.com/database"
}`);

		assert.include(output, '"<PLANETSCALE_OAUTH_ACCESS_TOKEN>"');
		assert.include(output, '"<PLANETSCALE_OAUTH_REFRESH_TOKEN>"');
		assert.include(
			output,
			'user:pscale_pw_<PLANETSCALE_DATABASE_PASSWORD>@example.com'
		);
		assert.notInclude(output, '8zO_rNQC');
		assert.notInclude(output, 'W_zjmZ1a');
		assert.notInclude(output, 'AAAAAAAA');
	});
});

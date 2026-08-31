import { assert, describe, it } from '@effect/vitest';

import { Effect, Layer } from 'effect';

import { HttpText } from '../http-text.ts';
import { LlmsIndexReader, LlmsIndexReaderLayer } from '../llms-index.ts';
import { LlmsTxtIndexStrategy } from '../model.ts';

const makeHttpTextLayer = (body: string): Layer.Layer<HttpText> =>
	Layer.succeed(
		HttpText,
		HttpText.of({
			get: () => Effect.succeed(body)
		})
	);

describe('LlmsIndexReader', () => {
	it.effect('excludes configured non-page resources', () => {
		const index = [
			'# Documentation',
			'',
			'- [Guide](https://example.com/guide): User-facing guide.',
			'- [OpenAPI](https://example.com/openapi.json): API schema.'
		].join('\n');
		const strategy = new LlmsTxtIndexStrategy({
			excludeUrls: ['https://example.com/openapi.json']
		});

		return Effect.gen(function* () {
			const reader = yield* LlmsIndexReader;
			const pages = yield* reader.load(
				'https://example.com/llms.txt',
				strategy
			);

			assert.strictEqual(pages.length, 1);
			assert.strictEqual(pages[0]?.url, 'https://example.com/guide');
		}).pipe(
			Effect.provide(LlmsIndexReaderLayer),
			Effect.provide(makeHttpTextLayer(index))
		);
	});
});

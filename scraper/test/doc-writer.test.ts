import { assert, describe, it } from '@effect/vitest';

import { sourceMetadata } from '../doc-writer.ts';

describe('sourceMetadata', () => {
	it('preserves useful source title and description', () => {
		assert.deepStrictEqual(
			sourceMetadata(`---
title: "Export Parquet"
description: Export query results to Apache Parquet files.
---

Body`),
			{
				title: 'Export Parquet',
				description: 'Export query results to Apache Parquet files.'
			}
		);
	});

	it('leaves missing metadata available for generated fallbacks', () => {
		assert.deepStrictEqual(sourceMetadata('# No frontmatter'), {});
	});

	it('parses quoted, commented, and multiline YAML metadata', () => {
		assert.deepStrictEqual(
			sourceMetadata(`---
title: "A: B" # source comment
description: |
  A quoted "value".
  Second line.
---`),
			{
				title: 'A: B',
				description: 'A quoted "value".\nSecond line.\n'
			}
		);
	});

	it('ignores malformed source frontmatter', () => {
		assert.deepStrictEqual(sourceMetadata('---\ntitle: [broken\n---'), {});
	});
});

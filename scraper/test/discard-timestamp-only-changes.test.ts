import { assert, describe, it } from '@effect/vitest';

import { normalizeVolatileFrontmatter } from '../discard-timestamp-only-changes.ts';

describe('normalizeVolatileFrontmatter', () => {
	it('normalizes generated access and current dates', () => {
		assert.strictEqual(
			normalizeVolatileFrontmatter(`---
url: https://example.com/docs
access_date: 2026-08-03T10:00:00.000Z
current_date: 2026-08-03T10:00:00.000Z
---

# Documentation
`),
			`---
url: https://example.com/docs
access_date: <volatile>
current_date: <volatile>
---

# Documentation
`
		);
	});

	it('does not normalize matching fields outside frontmatter', () => {
		const document = `# Documentation

access_date: this is content
`;
		assert.strictEqual(normalizeVolatileFrontmatter(document), document);
	});

	it('preserves substantive frontmatter changes', () => {
		assert.notStrictEqual(
			normalizeVolatileFrontmatter(`---
title: Before
access_date: yesterday
---`),
			normalizeVolatileFrontmatter(`---
title: After
access_date: today
---`)
		);
	});
});

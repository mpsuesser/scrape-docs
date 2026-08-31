import { assert, describe, it } from '@effect/vitest';

import { ConfigProvider, Effect, Layer } from 'effect';
import * as Option from 'effect/Option';
import {
	Headers,
	HttpClient,
	HttpClientResponse
} from 'effect/unstable/http';

import { HttpText, HttpTextLayer } from '../http-text.ts';

const testToken = 'test-token';

const HttpClientTest = Layer.succeed(
	HttpClient.HttpClient,
	HttpClient.make((request) => {
		const authentication = Option.match(
			Headers.get(request.headers, 'authorization'),
			{
				onNone: () => 'anonymous',
				onSome: (header) =>
					header === `Bearer ${testToken}`
						? 'authenticated'
						: 'unexpected'
			}
		);
		return Effect.succeed(
			HttpClientResponse.fromWeb(request, new Response(authentication))
		);
	})
);

const GithubTokenTest = ConfigProvider.layer(
	ConfigProvider.fromUnknown({ GITHUB_TOKEN: testToken })
);

describe('HttpText', () => {
	it.effect('authenticates only GitHub API requests', () =>
		Effect.gen(function* () {
			const http = yield* HttpText;

			const githubResponse = yield* http.get(
				'https://api.github.com/repos/example/docs/git/trees/main'
			);
			const externalResponse = yield* http.get(
				'https://example.com/documentation'
			);

			assert.strictEqual(githubResponse, 'authenticated');
			assert.strictEqual(externalResponse, 'anonymous');
		}).pipe(
			Effect.provide(HttpTextLayer),
			Effect.provide(HttpClientTest),
			Effect.provide(GithubTokenTest)
		)
	);
});

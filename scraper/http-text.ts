import { Context, Effect, Layer } from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/unstable/http';

import { HttpFetchError } from './errors.ts';

const defaultUserAgent =
	'mydb-doc-scraper/1.0 (+https://github.com/josephyoung/mydb)';

export class HttpText extends Context.Service<
	HttpText,
	{
		readonly get: (
			url: string,
			accept?: string
		) => Effect.Effect<string, HttpFetchError>;
	}
>()('@mydb/scraper/HttpText') {}

export const HttpTextLayer: Layer.Layer<
	HttpText,
	never,
	HttpClient.HttpClient
> = Layer.effect(
	HttpText,
	Effect.gen(function* () {
		const client = (yield* HttpClient.HttpClient).pipe(
			HttpClient.followRedirects(),
			HttpClient.filterStatusOk
		);

		const get = Effect.fn('HttpText.get')(function* (
			url: string,
			accept =
				'text/markdown, text/plain, application/vnd.github+json;q=0.9, application/json;q=0.9, application/xml;q=0.8, text/xml;q=0.8, text/html;q=0.7'
		) {
			const request = HttpClientRequest.get(url).pipe(
				HttpClientRequest.accept(accept),
				HttpClientRequest.setHeader('User-Agent', defaultUserAgent)
			);
			const response = yield* client.execute(request).pipe(
				Effect.mapError(
					(cause) =>
						new HttpFetchError({
							url,
							message: `GET ${url} failed`,
							cause
						})
				)
			);

			return yield* response.text.pipe(
				Effect.mapError(
					(cause) =>
						new HttpFetchError({
							url,
							message: `Reading body from ${url} failed`,
							cause
						})
				)
			);
		});

		return HttpText.of({ get });
	})
);

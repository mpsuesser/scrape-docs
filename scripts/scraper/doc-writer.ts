import {
	Array as Arr,
	Boolean as Bool,
	Context,
	Effect,
	FileSystem,
	Layer,
	Path,
	String as Str
} from 'effect';
import { pipe } from 'effect/Function';

import { DocWriteError, InvalidDocUrlError } from './errors.ts';
import {
	WrittenDocument,
	type DocPage,
	type DocSetConfig,
	type PageContent
} from './model.ts';
import { pageOutputPath } from './url-paths.ts';

const yamlString = (value: string): string =>
	`"${
		pipe(
			value,
			Str.replaceAll('\\', '\\\\'),
			Str.replaceAll('"', '\\"'),
			Str.replaceAll('\n', '\\n')
		)
	}"`;

const stripLeadingFrontmatter = (body: string): string =>
	pipe(body, Str.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, ''));

const renderDocument = (
	page: DocPage,
	content: PageContent,
	timestamp: string
): string =>
	pipe(
		[
			'---',
			`url: ${page.url}`,
			`title: ${yamlString(page.title)}`,
			`description: ${yamlString(page.description)}`,
			`access_date: ${timestamp}`,
			`current_date: ${timestamp}`,
			'---',
			'',
			stripLeadingFrontmatter(content.body),
			''
		],
		Arr.join('\n')
	);

const mapWriteError = (targetPath: string) => (cause: unknown) =>
	new DocWriteError({
		path: targetPath,
		message: `Writing ${targetPath} failed`,
		cause
	});

export class DocWriter extends Context.Service<
	DocWriter,
	{
		readonly prepare: (
			docSet: DocSetConfig
		) => Effect.Effect<void, DocWriteError>;
		readonly write: (
			docSet: DocSetConfig,
			page: DocPage,
			content: PageContent,
			timestamp: string
		) => Effect.Effect<WrittenDocument, DocWriteError | InvalidDocUrlError>;
	}
>()('@mydb/scripts/scraper/DocWriter') {}

export const DocWriterLayer: Layer.Layer<
	DocWriter,
	never,
	FileSystem.FileSystem | Path.Path
> = Layer.effect(
	DocWriter,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const prepare = Effect.fn('DocWriter.prepare')(
			function* (docSet: DocSetConfig) {
				const exists = yield* fs.exists(docSet.outputDirectory).pipe(
					Effect.mapError(mapWriteError(docSet.outputDirectory))
				);

				yield* Bool.match(exists, {
					onFalse: () => Effect.void,
					onTrue: () =>
						fs.remove(docSet.outputDirectory, { recursive: true })
							.pipe(
								Effect.mapError(
									mapWriteError(docSet.outputDirectory)
								)
							)
				});

				yield* fs
					.makeDirectory(docSet.outputDirectory, { recursive: true })
					.pipe(
						Effect.mapError(mapWriteError(docSet.outputDirectory))
					);
			}
		);

		const write = Effect.fn('DocWriter.write')(function* (
			docSet: DocSetConfig,
			page: DocPage,
			content: PageContent,
			timestamp: string
		) {
			const outputPath = yield* pageOutputPath(path, docSet, page);
			const outputDirectory = path.dirname(outputPath);
			yield* fs.makeDirectory(outputDirectory, { recursive: true }).pipe(
				Effect.mapError(mapWriteError(outputDirectory))
			);
			yield* fs
				.writeFileString(
					outputPath,
					renderDocument(page, content, timestamp)
				)
				.pipe(Effect.mapError(mapWriteError(outputPath)));
			return new WrittenDocument({
				url: page.url,
				path: outputPath,
				strategy: content.strategy
			});
		});

		return DocWriter.of({ prepare, write });
	})
);

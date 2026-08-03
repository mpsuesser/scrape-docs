const volatileFrontmatterFields = /^(access_date|current_date):[^\r\n]*$/gm;

export const normalizeVolatileFrontmatter = (document: string): string => {
	const match = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(document);
	if (match === null) {
		return document;
	}

	const opening = match[1];
	const frontmatter = match[2];
	const closing = match[3];
	if (
		opening === undefined ||
		frontmatter === undefined ||
		closing === undefined
	) {
		return document;
	}

	const normalized = frontmatter.replace(
		volatileFrontmatterFields,
		'$1: <volatile>'
	);
	return `${opening}${normalized}${closing}${document.slice(match[0].length)}`;
};

const runGit = async (
	repository: string,
	args: ReadonlyArray<string>
): Promise<Uint8Array> => {
	const process = Bun.spawn(['git', ...args], {
		cwd: repository,
		stdout: 'pipe',
		stderr: 'inherit'
	});
	const output = new Uint8Array(await new Response(process.stdout).arrayBuffer());
	const exitCode = await process.exited;
	if (exitCode !== 0) {
		throw new Error(`git ${args.join(' ')} failed with exit code ${exitCode}`);
	}
	return output;
};

export const discardTimestampOnlyChanges = async (
	repository: string
): Promise<number> => {
	const decoder = new TextDecoder();
	const changedOutput = await runGit(repository, [
		'diff',
		'--cached',
		'--name-only',
		'--diff-filter=M',
		'-z'
	]);
	const changedPaths = decoder
		.decode(changedOutput)
		.split('\0')
		.filter((path) => path.endsWith('.md'));
	let discarded = 0;

	for (const path of changedPaths) {
		const previous = decoder.decode(
			await runGit(repository, ['show', `HEAD:${path}`])
		);
		const current = await Bun.file(`${repository}/${path}`).text();
		if (
			normalizeVolatileFrontmatter(previous) !==
			normalizeVolatileFrontmatter(current)
		) {
			continue;
		}

		await runGit(repository, [
			'restore',
			'--source=HEAD',
			'--staged',
			'--worktree',
			'--',
			path
		]);
		discarded += 1;
	}

	return discarded;
};

if (import.meta.main) {
	const repository = process.argv[2];
	if (repository === undefined) {
		throw new Error('Usage: discard-timestamp-only-changes.ts <repository>');
	}
	const discarded = await discardTimestampOnlyChanges(repository);
	console.log(`Discarded ${discarded} timestamp-only file changes`);
}

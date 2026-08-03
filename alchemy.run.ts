import * as Alchemy from 'alchemy';
import * as GitHub from 'alchemy/GitHub';
import * as Effect from 'effect/Effect';

const docsets = [
	'alchemy',
	'better-auth',
	'drizzle',
	'electron',
	'ent-go',
	'ent-ts',
	'foldkit',
	'ladybugdb',
	'pi',
	'planetscale',
	'ts-morph',
	'turborepo'
] as const;

export default Alchemy.Stack(
	'ScrapedDocs',
	{
		providers: GitHub.providers(),
		state: Alchemy.localState()
	},
	Effect.gen(function* () {
		for (const docset of docsets) {
			const name = `scraped-docs-${docset}`;

			yield* GitHub.Repository(name, {
				owner: 'mpsuesser',
				name,
				description: `Automatically refreshed ${docset} documentation in Markdown`,
				visibility: 'public',
				hasIssues: false,
				hasProjects: false,
				hasWiki: false,
				autoInit: true,
				topics: ['documentation', 'markdown', 'scraped-docs']
			});
		}
	})
);

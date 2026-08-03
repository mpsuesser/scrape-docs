# scrape-docs

Centralized, scheduled documentation scraping for a collection of public Markdown repositories.

The scraper runs every 5 minutes on GitHub Actions and publishes each docset to `mpsuesser/scraped-docs-<name>`. Downstream repositories contain only the generated documentation and can be used directly as OpenCode references.

## Docsets

- Alchemy
- Electron
- Ent (Go)
- Ent (TypeScript)
- Foldkit
- LadybugDB
- Pi
- ts-morph
- Turborepo

## Commands

```sh
bun install
bun run typecheck
bun run test
bun run scrape-docs:foldkit
bun run alchemy:plan
```

Alchemy declares the downstream repositories in `alchemy.run.ts`. The workflow uses repository-scoped SSH deploy keys stored in the encrypted `DOCS_REPO_KEYS` Actions secret.

# scrape-docs

Centralized, scheduled documentation scraping for a collection of public Markdown repositories.

The scraper runs every 5 minutes on GitHub Actions and publishes each docset to `mpsuesser/scraped-docs-<name>`. Downstream repositories contain only the generated documentation and can be used directly as OpenCode references.

```jsonc
// opencode.jsonc
{
  // ...
  "references": {
    "foldkit-docs": {
      "repository": "mpsuesser/scraped-docs-foldkit",
      "branch": "main",
      "description": "Full scraped documentation for Foldkit",
    },
    "alchemy-docs": {
      "repository": "mpsuesser/scraped-docs-alchemy",
      "branch": "main",
      "description": "Full scraped documentation for Alchemy",
    },
  },
}
```

## Docsets

[Alchemy](https://github.com/mpsuesser/scraped-docs-alchemy)<br>
[Electron](https://github.com/mpsuesser/scraped-docs-electron)<br>
[Ent (Go)](https://github.com/mpsuesser/scraped-docs-ent-go)<br>
[Ent (TypeScript)](https://github.com/mpsuesser/scraped-docs-ent-ts)<br>
[Foldkit](https://github.com/mpsuesser/scraped-docs-foldkit)<br>
[LadybugDB](https://github.com/mpsuesser/scraped-docs-ladybugdb)<br>
[Pi](https://github.com/mpsuesser/scraped-docs-pi)<br>
[ts-morph](https://github.com/mpsuesser/scraped-docs-ts-morph)<br>
[Turborepo](https://github.com/mpsuesser/scraped-docs-turborepo)

## Commands

```sh
bun install
bun run typecheck
bun run test
bun run scrape-docs:foldkit
bun run alchemy:plan
```

Alchemy declares the downstream repositories in `alchemy.run.ts`. The workflow uses repository-scoped SSH deploy keys stored in the encrypted `DOCS_REPO_KEYS` Actions secret.

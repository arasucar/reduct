# Contributing to Reduct

Reduct stores product documentation, plans, and discussion history in the application's repository. Changes should keep those records readable, preserve their history, and make the local reader easy to use.

## Local development

Use Node.js 24 LTS and npm for development. The package requires Node.js 22.12 or later. From a source checkout:

```sh
npm ci
npm test
npm run build
npm run dev -- --repo /absolute/path/to/application
```

Initialize a disposable application directory with `npm run cli -- init --repo /absolute/path/to/application` if you need a workspace for development. Initialization asks before writing files. Use `npm run cli -- --help` to see the available commands.

`npm run dev` runs the CLI against the built reader. Run `npm run build` after changing the web UI, then reload the browser. The reader uses port 4310 by default; pass `--port 4311` to use another port.

### Use Reduct to develop Reduct

Run the reader from this checkout against its own product workspace:

```sh
npm run cli -- init --repo .
npm run build
npm run dev -- --repo . --port 4311
```

Skip initialization if `.reduct/` already exists. Initialization asks for confirmation and creates an empty map. The `--repo` option accepts any application directory; `--port` lets the development reader run alongside an installed release.

Give agents `npm run cli --` as the command prefix for record operations, for example `npm run cli -- check --repo .`. From outside the checkout, use `npm --prefix /absolute/path/to/reduct run cli -- check --repo /absolute/path/to/application`. This keeps development on the local source even when the published `reduct` command is installed globally.

## Source layout

| Location | Responsibility |
| --- | --- |
| `src/cli.ts` | Command routing, confirmation, and agent attribution |
| `src/store.ts` | Workspace records, validation, writes, and retained history |
| `src/model.ts` | Markdown frontmatter, identities, and discussion messages |
| `src/workflow.ts` | Work summaries and implementation brief source checks |
| `src/server.ts` | Local reader API and static assets |
| `src/seed.ts`, `src/upgrade.ts`, `src/guides.ts` | Initialization and managed guide updates |
| `web/` | React reader, navigation, discussions, and styling |
| `docs/` | Bundled planning and application agent instructions |
| `tests/` | CLI, workspace, discussion, and workflow regression tests |
| `scripts/` | Package preparation and local release archives |

`docs/AGENT_GUIDE.md` is installed as the compact `.reduct/agent/README.md`; the full README is installed as `.reduct/agent/reference/README.md`. Its **Using the reader** section generates `.reduct/help/how-to-use.md`. Preserve reference headings used by `guide TOPIC` and review documentation changes as part of the product, since new and synced workspaces receive them.

## Proposing a change

Open an [issue](https://github.com/arasucar/reduct/issues) for a reproducible bug or a concrete feature proposal. Include the Reduct version, Node version, operating system, expected behavior, and the smallest useful reproduction. Remove private repository contents and credentials from examples.

For pull requests, explain the problem, resulting behavior, and checks you ran. Keep unrelated changes separate. Add regression coverage when changing record persistence, conflict handling, CLI behavior, or workflow rules.

Before submitting:

```sh
npm test
npm run build
npm pack --dry-run
```

After building, run `npm run benchmark:agent-access` for repeatable character-volume comparisons of agent guides, conditional reads, review output, local edits, and retained-version comparisons. The benchmark uses a disposable workspace, verifies preserved content, and makes no model calls. Character reductions do not establish token, quota, reasoning, or end-to-end quality improvements; evaluate those with the intended agent and representative tasks.

The build checks TypeScript, builds the reader, emits the library and declarations, and marks the CLI executable. Generated `lib/`, `dist/`, and `releases/` directories are excluded from Git.

## Release procedure

1. Review changes and update `CHANGELOG.md`. Choose the appropriate version increment; account for compatibility changes to records, CLI commands, and the library.
2. Run `npm version patch --no-git-tag-version` (or the appropriate increment). Commit and tag only through the maintainer's chosen release workflow.
3. Run `npm test` and `npm run release:local`. The latter builds and packs the current version into `releases/`.
4. Inspect `npm pack --dry-run`. The package should contain the CLI, library declarations, reader assets, README, bundled guides, license, and release notes.
5. Install the archive in a disposable npm prefix and test `reduct version`, `reduct --help`, initialization, workspace validation, and the reader. Test the archive itself to catch missing files that the source checkout could hide.
6. When the maintainer is ready to release, authenticate with npm and publish the reviewed archive using `npm publish /absolute/path/to/archive.tgz --access public`.

Publishing is a separate maintainer action. A local archive does not update npm. Existing users install the new package, restart the reader, and run `reduct sync --repo PATH --agent NAME` to update unmodified managed guides.

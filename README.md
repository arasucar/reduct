<div align="center">

# Reduct

**Product context, plans, and discussions, kept with your code.**

A local product workspace for developers working with AI agents.

[![npm version](https://img.shields.io/npm/v/%40arasucar%2Freduct)](https://www.npmjs.com/package/@arasucar/reduct)
[![Node.js](https://img.shields.io/node/v/%40arasucar%2Freduct)](https://www.npmjs.com/package/@arasucar/reduct)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/arasucar/reduct/blob/main/LICENSE)

[Quick start](#installation) · [Reader guide](#using-the-reader) · [Agent reference](#agent-roles) · [Contributing](https://github.com/arasucar/reduct/blob/main/CONTRIBUTING.md)

</div>

## What it does

Reduct keeps your product map, change plans, and discussions in Markdown inside your repository. Read and review them in a local browser UI while your agents maintain the records alongside the code.

- **Map the product.** Organize existing capabilities into modules and features, with source references and explicit unknowns.
- **Plan changes.** Keep the requested change, proposed behavior, and decisions together in a Work record.
- **Discuss in context.** Comment on documents or selected passages and compare retained versions.
- **Hand off implementation.** Copy a settled brief to an implementation agent, then retain the delivered outcome and verification results.

Install once and use across Swift/Xcode, JavaScript, Python, and other repositories. Your application needs no npm manifest or Reduct dependency. The UI runs locally; you give requests and handoffs directly to your agents.

## Installation

Requires **Node.js 22.12 or later** and npm. **Node.js 24 LTS is recommended.** See [npm's installation guide](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm/) if you need a runtime.

```sh
npm install --global @arasucar/reduct
reduct version
cd /path/to/your-app
reduct init
reduct ui
```

Initialization asks for confirmation before creating `.reduct/` and adding a marked section to your application's `AGENTS.md`. It preserves existing instructions and starts with an empty product map.

Open the URL printed by `reduct ui`, usually [http://127.0.0.1:4310](http://127.0.0.1:4310). Keep the terminal running; Ctrl+C stops the reader.

Then give your agent this request:

> Read the Initial product mapping section in `.reduct/agent/README.md`, inspect this application, document its existing modules and features, and report mapping coverage and unknowns.

Use the full package name **`@arasucar/reduct`**; the unscoped `reduct` package is unrelated. The installed command is `reduct`. Global installation does not add dependencies to your application. For a specific version, use `npm install --global @arasucar/reduct@0.1.2`.

<details>
<summary>Installation troubleshooting</summary>

### Command not found

Open a new terminal, then check your active Node installation and global package location:

```sh
node --version
npm list --global --depth=0
npm prefix --global
```

Confirm `@arasucar/reduct` is installed. On macOS/Linux, npm's executable directory is the printed prefix followed by `/bin`; on Windows, it is the prefix itself. Ensure that directory is on your `PATH`. See [npm's installation locations](https://docs.npmjs.com/cli/configuring-npm/folders/).

A Node version manager usually configures this for you. Switching Node installations may require reinstalling Reduct. Agents must also check command availability in their own execution environment.

### Installation permissions

For an `EACCES` error, use a Node version manager or a user-owned global installation directory following [npm's permissions guidance](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally/).

</details>

## Initialize an application

From your application root:

```sh
cd /path/to/your-app
reduct init
```

The current directory becomes the workspace's application root. Use `--repo /absolute/path/to/application` when targeting another directory. In a monorepo, choose the intended application's root explicitly.

Before writing files, Reduct shows the resolved repository path, explains that it will create `.reduct/` and add a marked instruction section to the application's `AGENTS.md`, then asks:

```text
Continue? [y/N]
```

Only `y` or `yes` confirms. Enter, another answer, or end of input cancels without changing files. No agent information is required. Existing application instructions are retained. If `AGENTS.md` is a symlink, writing through it updates its target.

Initialize once per repository. Initialization starts with empty modules and refuses to overwrite an existing `.reduct/`. Ask your agent to follow the [initial mapping directive](#initial-product-mapping), available in its installed `.reduct/agent/README.md`, to populate and validate module and feature records. Initialization does not automatically inspect your code or dispatch an agent.

## Launch the reader

```sh
cd /path/to/your-app
reduct ui
```

Reduct starts a local reader server for that repository's `.reduct/` and prints its URL. Open it in your browser; the default is [http://127.0.0.1:4310](http://127.0.0.1:4310). Keep the terminal running while using the reader. Press Ctrl+C to stop it. You can launch the reader immediately after initialization and watch the map grow as your agent writes records.

If the port is occupied, choose another explicitly:

```sh
reduct ui --port 4311
```

For multiple applications, run separate reader processes with different ports and the correct repository paths. The current CLI does not automatically open the browser, reuse an existing server, or select an available port. Run it from the repository root, or pass `--repo`; it uses the current directory by default rather than searching parent directories for a workspace.

## Update or uninstall

Update the global installation, then stop and restart running readers:

```sh
npm install --global @arasucar/reduct@latest
```

In each initialized repository, have your agent sync the bundled instructions:

```sh
reduct sync --repo . --agent "Planning agent"
reduct version
```

Sync preserves locally customized guides and product records; review any skipped files. Do not initialize again to update. To remove the global tool, use `npm uninstall --global @arasucar/reduct` to remove this package. Uninstalling the tool leaves each application's `.reduct/` records in place.

## Initial product mapping

Give your agent this request after initialization:

> Read the Initial product mapping section in `.reduct/agent/README.md`, inspect this application, document its existing modules and features, and report mapping coverage and unknowns.

### Scope and starting point

Read the application's existing `AGENTS.md` and applicable directory instructions first. Work from the application root, where `.reduct/` should live. In a monorepo, use the owner's named application; if several applications could be the target, clarify that choice before creating a workspace.

This request authorizes installing the global tool, initializing Reduct, documenting the existing product, validating the workspace, and starting its local reader. Respect repository restrictions on application builds, tests, and runtime access. Product mapping does not require changing application behavior or creating proposed implementation work.

Preserve existing changes and instructions. Inspect the active Node/npm environment, any existing Reduct installation, and any existing `.reduct/` before making changes. Reuse an existing workspace and records; do not delete it to start over. Do not commit, publish, or send documents elsewhere unless the owner asks.

### Prepare the workspace

Use the installation and initialization steps above. Reuse existing records; when an agent runs `init`, obtain the owner's confirmation before answering its prompt. Read the application instructions and the agent-role and workflow sections below. Initialization generates:

```text
application/
├── AGENTS.md                      # Existing instructions plus a marked Reduct section
└── .reduct/
    ├── README.md                  # Product workspace entrypoint
    ├── AGENTS.md                  # Planning role
    ├── tool.json                  # Version and managed-guide hashes
    ├── help/how-to-use.md          # Reader guide
    ├── agent/README.md             # Installed copy of this README
    └── modules/                   # Initially empty
```

If initialization fails partway through, inspect the error and files and report recovery needs rather than deleting documentation. For an existing workspace, run `reduct check --repo .` before extending its map.

### Discover the existing product

Inspect the application's README, entrypoints, routes/screens, commands or API surface, domain models, storage, integrations, configuration, and relevant tests. Follow real user journeys into their implementation. Exclude dependencies, generated output, and fixtures unless they explain a capability. Use existing documentation as a starting point and compare its claims with source.

Group the product into stable domains expressed in the language its users use. A module is a domain such as Orders or Settings; a feature is a capability such as Order tracking or Interface language. Avoid turning every component, endpoint, source directory, or test into a feature. Shared infrastructure belongs in a module's constraints or a feature's dependencies unless it is itself a meaningful product capability.

For each domain, identify its capabilities, entrypoints, relevant source locations, dependencies, and gaps in understanding. For an unfamiliar or large repository, map the main domains first, document the important journeys in more detail, and state which areas remain unexplored. A first map can be useful without claiming exhaustive coverage.

If the repository has no implemented product yet, describe its evidenced purpose and constraints, record that capabilities are not implemented, and leave the feature map empty. Do not invent existing behavior from a roadmap.

Ask about consequential ambiguities in product identity or scope. Make routine grouping choices yourself and make them reviewable in the map. Runtime exploration is useful when available and authorized, but source inspection is enough to begin mapping. Distinguish observed runtime behavior, code-supported behavior, test expectations, and uncertain inference.

### Create and populate records

Search existing records before creating anything. Reuse their stable IDs and paths. Use the CLI to generate records, directories, frontmatter, and attribution. For example, only if Orders is a real domain in this application:

```sh
reduct create module --title "Orders" --repo . --agent "Setup agent" --reason "Initial product mapping"
```

The command prints the generated ID, path, and hash. Supply the returned module ID when creating a feature:

```sh
reduct create feature --title "Order tracking" --parent MODULE-ID --repo . --agent "Setup agent" --reason "Initial product mapping"
```

`MODULE-ID` and `FEATURE-ID` below are placeholders for actual returned IDs. Do not infer IDs from titles. Creation produces templates; replace their placeholder prose with inspected findings. Write the Markdown body to a temporary file outside `.reduct/`, then use the latest record hash to save it:

```sh
reduct read FEATURE-ID --repo .
reduct write FEATURE-ID --hash HASH --body-file /absolute/path/to/feature-body.md --repo . --agent "Setup agent" --reason "Documented current behavior from application sources"
```

Use the same read/write flow to populate modules. If a hash conflict occurs, re-read the record and reconcile the intervening change before saving.

Each module should explain its purpose, included capabilities, shared rules, boundaries, dependencies, and unknowns. Each feature should explain:

- Who uses it, why, and where they enter the flow.
- Current behavior, meaningful rules, edge cases, and error states supported by evidence.
- Dependencies and relationships to other capabilities.
- Repository-relative source references, with useful symbols or line locations, and the inspected source revision or dirty-tree state.
- Specific unknowns and evidence limits, distinguishing implemented behavior from test expectations and inference.

Use readable prose focused on the product. Put the evidence near the claim it supports. Keep proposed changes out of current behavior. Feature pages do not need verification checklists or test-pass claims. Do not create Work, Analysis, Implementation briefs, review threads, or snapshots merely to fill the tree; use them when an actual request or discussion needs them.

Keep `.reduct/README.md` as the product entrypoint: add a brief application overview, relative links to module records, the mapping scope, and areas still to inspect. Retain its workflow links and record the application-root launch command. Product facts belong in records; this overview should help the reader navigate them.

Do not add miscellaneous Markdown inside `.reduct/`: Reduct expects record frontmatter on Markdown files other than `README.md` and `AGENTS.md`. Let the CLI create record paths, and let future workflow commands create their own discussion/history directories.

### Validate and preview

```sh
reduct check --repo .
reduct ui
```

Resolve document validation errors before calling setup complete. `check` validates the record structure and links; it does not prove that the prose matches application behavior. Inspect the map for leftover template text, unsupported claims, duplicates, broken source references, and uncovered domains.

Use the [reader launch guidance](#launch-the-reader). Confirm that the reader responds and inspect navigation when browser access is available; report the URL, process/session details, and any preview limitation accurately. The reader can display the map while discovery is still in progress.

Review the resulting diff: the marked application instructions and `.reduct/` documentation. No application dependency or launch-script changes are needed. Keep product records, guides, discussions, and retained versions in version control according to the application's policy. Never include credentials or private runtime data in the product map.

### Report completion

Tell the owner the installed version, workspace location, reader URL, launch command, modules/features mapped, mapping coverage and unknowns, validation results, and any blockers. List checks actually run separately from code or test files inspected. Do not call setup complete if installation, initialization, document population, or validation remains blocked.

Point the owner to [Using the reader](#using-the-reader), also available in `.reduct/help/how-to-use.md`, for reading, commenting, and the next change request. Initial mapping does not authorize future product changes.

## Using the reader

### Work with your agents

Use the UI to read documents and ask for clarification. Give analysis and change requests directly to your planning agent; it maintains the records. Tell it the record ID or path when you have added comments. The UI does not dispatch agents or provide document-editing and lifecycle controls.

Use [initial product mapping](#initial-product-mapping) for first setup and [agent roles](#agent-roles) for role definitions.

### Find and read documents

Modules contain features and Work. Work has a primary home and can link other affected features. Its Plan appears on the Work page alongside optional Analysis and a separate Implementation brief. For full document definitions, see the [record conventions](#record-conventions).

- **Search and tree:** navigate the product map and linked capabilities.
- **Breadcrumb and document path:** identify what you are reading and its file/version reference.
- **Details and History:** read current Work or compare retained versions. Ordinary drafts are not saved at every keystroke.
- **Source references:** expand code and commit locations supporting the description.
- **Show closed work:** reveal completed, rejected, and superseded branches. Their files and discussions remain available.

Read feature descriptions against the actual application and comment on mismatches. Local browser reading history highlights changes since your last visit; opening a document marks it as viewed without approving it.

### Ask for clarification

Select a passage, including bold text, links, or inline code, and choose **Comment on selection**, or use **Add comment** for the entire document. Reduct preserves the reviewed version and quoted passage in a Markdown thread. If the passage changes later, the thread retains its original context.

Your agent answers, clarifies the prose when useful, and resolves addressed feedback with a rationale. Use **Ask a follow-up** to continue an addressed thread; posting reactivates it. A clarification comment does not authorize implementation or establish new product intent.

The profile uses repository Git identity where available and a local browser fallback otherwise. It identifies comment authors rather than providing a remote login.

### Review and hand off a change

Read the Plan in Work and give decisions directly to the planning agent. Once it has prepared a settled Implementation brief, **Copy for implementation** copies that document's Markdown. Manually pass it to your implementation agent; this handoff authorizes execution without another approval record. Copying alone does not launch an agent or record a handoff. Tell the planning agent which version you passed so it can retain the history.

If the Plan changes, the UI flags a brief whose source no longer matches. Have the planning agent reconcile it before handing off revised instructions. During delivery, unresolved product or scope choices come back to you.

After implementation, read the reported outcome, verification results, and updated feature descriptions. Completion is agent-reported evidence. Pending checks and limitations remain visible; accepting verification limitations requires your direct instruction.

### Notifications and status

The top-bar bell opens a compact list of decisions, Plans needing review, unseen agent replies, and changed or missing brief sources. Reading a reply clears its local notification; pending decisions remain until the agent records progress. A prepared brief matching the Plan clears the Plan-review prompt. Outside click or Escape closes the dropdown.

Statuses describe progress; they are not controls:

| Status | What to do |
| --- | --- |
| Not yet analyzed / Partially documented | Request further mapping if needed |
| Documented | Read current behavior and flag mismatches |
| Planning / Draft | Read the developing proposal |
| Awaiting your decision | Give the agent your answer directly |
| Ready for review / Under review | Review the Plan and clarify it |
| Ready for implementation | Manually hand off the prepared brief |
| Brief needs updating | Ask the planning agent to reconcile its source |
| In progress | Follow reported implementation progress |
| Awaiting verification | Review outstanding checks and provide requested manual evidence |
| Completed | Read the outcome and verification evidence |
| Rejected / Superseded | Consult retained history when useful |

Implementation briefs have no separate status control. Markdown is the source of truth; the reader permits comments and replies while agents maintain other records through files or the CLI.

## Agent roles

These are working roles. The same agent can perform either role when directly requested by the owner; existing application instructions still apply.

### Planning agent

Start at `.reduct/`. The planning agent maintains product understanding and turns the owner's intention into a reviewable proposal.

#### Responsibilities

- **Understand and map:** inspect sources, relevant tests, documentation, and discussions. Explain existing capabilities, constraints, dependencies, and gaps with evidence. Use the [initial mapping directive](#initial-product-mapping) for the first product map.
- **Analyze a request:** identify the problem, expected result, affected features, edge cases, and alternatives. Choose a sensible primary home and reuse existing Work where appropriate.
- **Prepare a proposal:** make behavior, scope, tradeoffs, and unresolved decisions clear enough for the owner to assess. Use supporting analysis when it adds value.
- **Address discussion:** answer questions, clarify prose, and resolve only addressed feedback while preserving its context and history.
- **Prepare the handoff:** translate settled decisions into a self-contained Implementation brief and keep it aligned with its source Plan.
- **Maintain context after delivery:** review reported outcomes and feature updates against the intended result, retaining deviations, uncertainties, and remaining concerns.

#### Limits

A planning request authorizes investigation and documentation. Application edits and application build/test execution require a separate direct owner request, subject to repository restrictions. Initial setup covers installation, mapping, workspace validation, and reader preview under its directive.

Choose routine documentation structure yourself. Ask the owner about consequential product policies, scope, and tradeoffs; do not rewrite accepted intent to fit an easier implementation.

The expected result is an accurate product map or a clear proposal with visible decisions, followed by settled instructions when ready for handoff.

### Implementation agent

Start at the application root. The implementation agent delivers an authorized change and records what actually happened.

#### Responsibilities

- **Establish the requested change:** read the direct request or manually handed-off brief, its Work, affected features, discussion, and source context. A direct application request does not require a Reduct Plan.
- **Check the starting state:** inspect existing edits and instructions. Surface material conflicts between the handed-off version, newer decisions, and actual code.
- **Deliver within scope:** implement accepted behavior, choose ordinary internal technical details, and preserve unrelated work.
- **Verify:** run checks appropriate to the change and permitted by repository instructions. Separate results from inspected code or test expectations, and identify outstanding runtime/device/manual gates.
- **Reconcile the product record:** update affected features to describe delivered behavior; create a concise record for an undocumented capability when needed.
- **Report the outcome:** record deviations, remaining work, and evidence. Planned implementation additionally maintains its Work through the completion procedure.

#### Limits

The owner's direct request or manual handoff authorizes execution; no extra Reduct approval record or brief status is required. A Plan, UI comment, resolved discussion, or brief found in the workspace does not authorize implementation on its own. Copying a brief does not launch an agent or record handoff. Record handoff history only when the owner reports which version was passed.

Choose technical details within scope. Return consequential product, scope, or acceptance changes to the owner; continue independent work where possible while awaiting decisions. Accepting verification limitations requires a direct owner instruction. A small direct repair does not need a ceremonial Work record.

The expected result is delivered behavior, current feature records, and a clear account of actual checks, deviations, and remaining limitations.

### Shared boundaries

The owner gives requests and decisions directly to agents and uses the reader for clarification. Do not dispatch or message another agent without authorization. Neither role grants implicit permission to commit, publish, deploy, or perform unrelated operations.

Preserve discussion and version history. Never invent owner quotations, authorization, or verification evidence. Reading test assertions or compiling tests is not an executed pass. Completion records agent-reported evidence; it cannot prove that prose matches behavior.

Local identities, role documents, and metadata provide attribution and guidance rather than authenticated access control or a filesystem sandbox.

## Agent workflow

Procedures and commands for agents maintaining the records.

### Resolve context

A short request should identify a stable record ID or Markdown path and the owner's intention. Locate its parent records, linked features, supporting documents, and open reviews. Use `context` or `briefing RECORD-ID --short --repo PATH` for compact context; omit `--short` for an expanded briefing. The reader's Copy for implementation action supplies the brief's body.

### Record conventions

| Record | Canonical contents |
| --- | --- |
| Module | Product domain, purpose, shared constraints, and boundaries |
| Feature | Current behavior, evidence, source references, dependencies, and unknowns |
| Work | Requested change, `## Plan`, primary home, affected features, lifecycle, outcome, and verification |
| Analysis | Optional findings, alternatives, and investigation evidence |
| Implementation brief | Settled behavior, tasks, scope, acceptance criteria, and reporting destinations |
| Review | Append-only clarification discussion tied to a reviewed version/passage |
| Snapshot | Retained complete version for review, comparison, or handoff history |

Use `###` headings for behavior, scope, decisions, and questions inside Work's Plan. Do not create new standalone Plan documents; retain legacy ones and their links/history. Feature pages describe delivered behavior without verification checklists; proposed changes belong in Work and actual implementation checks belong in its outcome.

IDs in YAML frontmatter are stable identifiers rather than filenames. Use CLI creation to generate records and paths. Re-read hashes before mutation to detect concurrent changes. Preserve schema, attribution, reasons, retained versions, and discussion history when editing Markdown directly; run `check` afterward.

### Document formatting

Use a small, consistent Markdown vocabulary in product records so documents stay readable and passages can be commented on:

- Plain paragraphs and ATX headings (`#`, `##`, `###`), preserving required headings such as `## Plan`.
- Flat bullet or numbered lists, with occasional bold emphasis.
- Single-line inline code for paths, identifiers, and short expressions; ordinary Markdown links for documents and web pages.
- Only when needed, fenced code blocks starting at column one, with spaces for indentation and no surrounding list or blockquote.

Write files with LF line endings and spaces instead of tabs. Keep inline formatting within one line and source references in a separate section. Prefer prose or short lists over tables. Avoid blockquotes, nested lists, task checkboxes, HTML, images, diagrams, and decorative formatting in new agent-authored records.

Planning agents apply this convention when creating or revising current drafts. Implementation agents follow it when updating product records and outcomes. Preserve YAML frontmatter, stable IDs, evidence, and exact owner quotations. Do not restyle retained versions or rewrite discussion history to meet this convention. Existing documents remain readable; these are authoring guidelines rather than a new validation rule.

### Planning procedure

1. Read the application instructions and inspect current sources. Update relevant feature facts and create/reuse one Work with a primary home and all affected-feature links.
2. Choose Simple for a small repair or Extended for deeper investigation. Work kinds are enhancement, bug, investigation, and maintenance; Analysis is optional.
3. Write the Plan and submit Work for review. Review milestones retain full versions; ordinary file edits appear in the reader automatically.
4. Read open threads, clarify the document where needed, and reply with the change or rationale. A reader follow-up reactivates an addressed thread.
5. Once decisions are settled, create an Implementation brief. Include exact Work and affected-feature IDs and file paths in its body so copied instructions have their reporting destinations. Remove unresolved “if approved” conditions.
6. If the Plan changed, reconcile the brief's body before refreshing its source. Source refresh does not rewrite instructions. Only the Plan section is compared for source drift.

### Implementation and completion procedure

For planned implementation, set Work to `in_progress` when starting. Follow the owner's handed-off version; flag material conflicts with newer instructions. Record delivered changes, deviations, and remaining work in Implementation outcome, and checks actually run in Verification results. Direct application changes reconcile feature records without requiring Work for each repair.

Review every affected feature against delivery. Supply its current hash and an update/no-change explanation when completing Work. Use `passed` for successful executed verification, `pending` for outstanding checks, or `accepted_limitations` with a direct owner instruction. Pending checks leave Work awaiting verification. Use `complete`; setting `completed` through `update-work` is rejected.

Completed Work hides from the default reader tree but remains in history. Retain documents, unresolved concerns, and manual/device gates.

### Commands

For an installed release, run the global `reduct` command from the application root. When developing Reduct itself, run the source CLI with `npm run cli --` from the Reduct checkout (or `npm --prefix /path/to/reduct run cli --` from another directory) instead of the global command. Replace `reduct` in the examples below with that source invocation. Always select the documentation workspace with `--repo`. The application/source repository may differ from a staged workspace. Initialization does not require --agent; other mutation commands require --agent NAME. --reason TEXT explains the update in the reader UI.

Read current IDs/hashes:

    reduct read RECORD-ID --repo /path/to/docs-workspace
    reduct context RECORD-ID --repo /path/to/docs-workspace
    reduct review list WORK-ID --status open --repo /path/to/docs-workspace

Create/write/submit:

    reduct create work --title "Repair" --parent FEATURE-ID --work-kind bug --workflow simple --agent "Planning agent" --reason "Owner requested analysis" --repo /path/to/docs-workspace
    Write `## Plan` with `###` subsections in the work document.
    reduct write WORK-ID --hash HASH --body-file /path/to/body.md --agent "Planning agent" --reason "Clarified REVIEW-ID" --repo /path/to/docs-workspace
    reduct submit-review WORK-ID --hash HASH --agent "Planning agent" --repo /path/to/docs-workspace

Reply/resolve (append Markdown; do not delete history):

    reduct review reply REVIEW-ID --hash THREAD-HASH --body-file /path/to/reply.md --agent "Planning agent" --repo /path/to/docs-workspace
    reduct review resolve REVIEW-ID --hash THREAD-HASH --body-file /path/to/resolution.md --agent "Planning agent" --repo /path/to/docs-workspace

Prepare/reconcile/record explicit human instructions:

    reduct create implementation --title "Implement repair" --parent WORK-ID --agent "Planning agent" --repo /path/to/docs-workspace
    reduct refresh-brief-source BRIEF-ID --hash HASH --plan-hash PLAN-HASH --agent "Planning agent" --repo /path/to/docs-workspace
    reduct record-handoff WORK-ID --hash HASH --revision SAVED-BRIEF-VERSION --owner-instruction-file /path/to/exact-human-handoff-instruction.md --agent "Planning agent" --repo /path/to/docs-workspace

Lifecycle and completion:

    reduct update-work WORK-ID --hash HASH --status awaiting_verification --workflow simple --affected-features FEATURE-A,FEATURE-B --agent "Planning agent" --repo /path/to/docs-workspace
    reduct complete WORK-ID --hash HASH --verification pending --feature-updates-file /path/to/feature-acknowledgements.json --agent "Planning agent" --repo /path/to/docs-workspace

The feature acknowledgement JSON is an array of {id, hash, reason}, covering every affected feature. It is embedded into the work record, not maintained as another canonical report. For accepted limitations, supply --owner-instruction-file.

Use snapshots for additional agent checkpoints. Direct Markdown edits remain possible, but preserve schema, stable IDs, approval/content hashes, reviewed versions, actor attribution, reasons, and review history. Run check afterward. The reader role is a UI/API boundary, not a filesystem sandbox for agents.

## Development and release

See [CONTRIBUTING.md](https://github.com/arasucar/reduct/blob/main/CONTRIBUTING.md) for the source layout, local development, checks, and release procedure. See [CHANGELOG.md](https://github.com/arasucar/reduct/blob/main/CHANGELOG.md) for release notes.

To work on Reduct from a source checkout:

```sh
npm ci
npm test
npm run build
npm run dev -- --repo /path/to/application
```

### Develop Reduct against a chosen workspace

The development commands run the source checkout. Pass `--repo` after npm's `--` separator to choose the application directory whose `.reduct/` records you want to read:

```sh
npm run build
npm run dev -- --repo /absolute/path/to/application --port 4311
```

To use Reduct to document its own development, target the Reduct checkout with `--repo .`. If that workspace has not been initialized, run `npm run cli -- init --repo .` first and confirm the prompt. Initialization starts with an empty product map; use the [initial mapping request](#initial-product-mapping) to populate it.

Agents working on this checkout should also use the source CLI:

```sh
npm run cli -- check --repo .
npm run cli -- read RECORD-ID --repo .
```

From another directory, use `npm --prefix /absolute/path/to/reduct run dev -- --repo /absolute/path/to/application --port 4311`, or replace `dev` with `cli` and supply the desired command. Use absolute workspace paths with `--prefix`, since npm runs the script from the checkout.

Rebuild after UI changes and reload the reader. CLI changes are read from `src/` on the next invocation. This workflow does not require publishing or replacing the globally installed package.

To build a local release archive, run `npm run release:local`. This builds and packs the current version into `releases/`. Install the generated archive with `npm install --global /absolute/path/to/arasucar-reduct-VERSION.tgz`, replacing the path and version with the actual filename.

### Use the JavaScript library

Install Reduct as a local dependency in the consuming JavaScript project:

```sh
npm install @arasucar/reduct
```

Global installation exposes the CLI; library imports require a local dependency.

Import the scoped package:

```js
import { Store, serve } from '@arasucar/reduct';

const workspace = new Store('/path/to/application');
await serve(workspace, 4310);
```

The package also exports `init`, `syncWorkspace`, and `version`, with TypeScript declarations. Library `init` creates files directly; the confirmation prompt belongs to the CLI. An application embedding the library should provide its own confirmation flow if needed.

## License

[MIT](https://github.com/arasucar/reduct/blob/main/LICENSE).

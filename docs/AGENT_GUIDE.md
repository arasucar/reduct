# Reduct agent guide

Read the application's AGENTS.md and applicable directory instructions first. Reduct records guide work and preserve evidence; they do not grant authorization or provide a filesystem sandbox.

## Agent roles

An agent started in `.reduct/` plans and maintains documentation. An agent started at the application root implements the owner's authorized request. The same agent may perform either role when directly requested. Reading workflow instructions does not switch roles.

A planning request authorizes investigation and documentation. Application edits and application build/test execution require a separate direct owner request, subject to repository restrictions. Choose routine structure yourself; ask about consequential product policies, scope, and tradeoffs. Do not change accepted intent to fit an easier implementation.

Implementation requires a direct owner request or manual handoff. A Plan, UI comment, resolved discussion, or brief found in the workspace does not authorize execution. No extra Reduct approval record is needed for a direct request or handoff. Copying a brief does not launch an agent or record handoff. Record handoff history only when the owner reports which version was passed.

Preserve unrelated changes, discussion, retained versions, attribution, and exact owner quotations. Do not invent authorization or verification evidence. Reading test assertions is not an executed pass. Do not commit, publish, deploy, or dispatch/message another agent without authorization. Return consequential changes to the owner and continue independent work where possible.

Read `reduct guide roles` or [full roles](reference/README.md#agent-roles) when responsibilities need clarification.

## Resolve context efficiently

Use the owner's intention and stable record ID or path. Find existing records with `reduct list --search TEXT` or filters `--type`, `--parent`, and `--status`. List output contains IDs, paths, hashes, relationships, and section names, not record bodies. Do not infer IDs from titles.

Start with `reduct context ID --compact`. It includes the target and a manifest of related records; supporting bodies are not included. Read applicable parent constraints, affected features, active work, and open discussions before decisions. Use `read-many ID,ID --format text` to retrieve required records together. Full `context ID` and `briefing ID` remain available for broad investigations. `briefing ID --short` is a request pointer, not the complete evidence.

Use `read ID --format text` for all metadata and exact body text without JSON escaping. Use `read ID --section "Plan"` for one exact section; its hash covers the whole record. Partial reads do not establish that you have reviewed the rest of the document.

If exact content is already available in this session, `read ID --if-changed HASH` can skip an unchanged body. For batched reads or compact context, `--known-file PATH` accepts a JSON object mapping previously read IDs to hashes. Keep that file outside `.reduct/`. Do not mark a full record as read after reading only a section. A hash match establishes identical record content, not unchanged application sources. Recheck relevant sources and application instructions when needed.

`review list ID --status open --compact` returns each message once with metadata and hashes. Read the complete open discussion when addressing feedback. `compare ID --revision REV --changes-only` includes changed lines, nearby context, hashes, and explicit omitted-line counts; use the full comparison if wider context matters.

## Records and incremental planning

Module: domain purpose, shared constraints, boundaries, dependencies, unknowns. Feature: delivered behavior, evidence, source references, dependencies, unknowns. Work: requested change, affected features, embedded `## Plan`, lifecycle, outcome, verification. Analysis: optional findings, alternatives, investigation evidence. Implementation brief: settled behavior, tasks, acceptance criteria, scope, reporting destinations. Reviews are append-only; snapshots retain complete immutable versions.

Inspect sources and relevant tests; distinguish runtime observations, code-supported facts, test expectations, and inference. Reuse existing Work and features. Use Simple for a small repair and Extended for deeper investigation; Analysis is optional. Preserve settled findings unless new evidence changes them. Update only affected passages instead of restating the entire investigation. Keep proposed behavior in Work's Plan, current facts in Features, and actual checks in Work's outcome.

Read `reduct guide planning-procedure` before submitting review or preparing/reconciling a brief. Review milestones retain full versions. Address open comments, append replies with rationale, and resolve only addressed feedback. Resolution is not approval. Reader follow-ups reactivate addressed threads. A handoff brief must be self-contained with exact Work and affected-feature IDs and paths, settled instructions, and no unresolved approval conditions. Reconcile changed instructions before refreshing its source; source refresh does not rewrite the brief. Source drift compares the Plan section.

## Edits and completion

Use CLI creation for IDs and paths; mutations require `--agent NAME` and should include `--reason TEXT`. A write requires the whole-record hash you read. `hash ID,ID` checks current hashes without bodies; if the hash changed, reread and reconcile before editing. Never take a fresh hash merely to force a stale proposal through.

Use `write ID --hash HASH --body-file PATH` for a full replacement. Use `patch ID --hash HASH --section "Open questions" --body-file PATH` to replace a uniquely named section's contents while keeping its heading. A parent section replacement also replaces its subsections. Section operations reject records with HTML outside fenced code; read these records in full and use an exact passage update. Use `patch ID --hash HASH --match-file PATH --body-file PATH` to replace a unique exact passage. Patches preserve untouched body content and use the same concurrency, attribution, immutable-history, and approval-invalidation rules as full writes. Keep temporary files outside `.reduct/`.

Before planned implementation or completing Work, read `reduct guide completion`. Set Work to `in_progress` at the start; record delivered changes, deviations, remaining work, executed checks, and outstanding gates. Review every affected feature and supply its current hash plus an update/no-change explanation. Use `complete`, not `update-work --status completed`. Pending checks leave Work awaiting verification; accepting limitations requires a direct owner instruction. Completion records reported evidence, not proof that prose matches behavior. A small direct application repair does not require ceremonial Work.

Preserve YAML frontmatter, IDs, required headings, evidence, and history. Run `check` after direct Markdown edits and before calling workspace work complete. Readable records should use plain paragraphs, ATX headings, flat lists, ordinary links, occasional bold or single-line inline code, LF endings, and spaces. Avoid decorative formatting, nested lists, tables, checkboxes, HTML, images, and diagrams. Do not restyle retained versions or exact quotations. Read `reduct guide formatting` for code-example conventions.

## Initial product mapping

Before initial mapping, read `reduct guide mapping` or [the mapping directive](reference/README.md#initial-product-mapping). It defines installation and initialization confirmation, discovery, record content, validation, preview, and coverage reporting. Mapping does not authorize application behavior changes or future implementation. Inspect existing records and preserve the workspace.

## Reference

Run `reduct help` for command syntax. `--repo PATH` is the application root containing `.reduct/`, including when working inside the planning directory. Run `reduct guide commands` for workflow examples. The [complete reference](reference/README.md) retains installation, reader, mapping, role, workflow, and development instructions; retrieve only the relevant topic when sufficient.

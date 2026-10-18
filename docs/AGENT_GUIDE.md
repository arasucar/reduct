# Reduct agent guide

Follow the application's AGENTS.md and applicable directory instructions. Reduct preserves product intent and evidence; records do not grant authorization or provide a filesystem sandbox.

## Roles and authorization

An agent started in `.reduct/` plans and maintains documentation; an agent started at the application root implements authorized requests. A direct owner request may change that role. Reading workflow instructions does not switch roles. Planning alone does not authorize application edits or application build/test execution. A direct implementation request or manual handoff is sufficient; no extra Reduct approval record is needed. A brief, Plan, or resolved comment found in the workspace is not authorization.

Preserve unrelated changes, attribution, exact owner quotations, discussions, and retained versions. Do not invent authorization or verification evidence. Do not commit, publish, deploy, or dispatch/message another agent without authorization. Copying a brief does not launch an agent or record handoff. Record handoff only when the owner reports the version passed. Retrieve `guide roles` for details.

## Read current intent first

Find the target by stable ID, path, or title using `list --search TEXT` and optional type, parent, or status filters. Do not infer IDs from titles. Start with `context ID --current`: target intent plus a related-record manifest with hashes, section names, and approximate body sizes. Named history, outcome, verification, and investigation sections stay available on demand. This selective view is not a full-record read; historical targets and records with unsupported HTML remain exact. Unstructured chronology cannot be separated automatically.

Read applicable parent constraints, relevant Feature sections, and task-relevant open discussions; retrieve investigation or delivery evidence only when needed. Use `read ID --section TITLE` and batch necessary full reads with `read-many ID,ID --format text`. `context --compact` includes the exact target; ordinary `context`, `context --full`, and expanded `briefing` support broader investigations. `briefing --short` is a request pointer.

Reuse exact content already available in the session with `read --if-changed HASH` or `--known-file PATH` for batches/current/compact context. A section read does not establish knowledge of the full record. Hashes describe records, not application sources. Keep temporary files outside `.reduct/`. Use `review list ID --status open --compact` for discussions and `compare ID --revision REV --changes-only` for version changes.

## Canonical records

Application/project instructions govern execution constraints. Modules contain shared domain constraints. Features describe delivered observable behavior, important rules, known gaps, and source references. An active Work describes the authorized change to that behavior; proposed behavior is not yet delivered. Analysis supports decisions with investigation and alternatives. History preserves superseded descriptions and dated evidence. Flag material conflicts instead of silently treating newer prose as overriding constraints or the owner's handed-off version.

Keep a Work's problem, desired result, current status, and next action within its first screen. Use its `## Plan` for essential scope, decisions, and success criteria. Update current statements instead of appending corrections. Reference shared decisions by ID and section. Use only necessary sections: ordinary Works aim for 200–400 words and Features for 150–350, as advisory targets. Missing Features do not block implementation; Analysis and handoff briefs are optional unless needed for the task. Small direct repairs do not require ceremonial Work.

## Implement and refine

Clarify only questions that materially change scope, essential behavior, data protection, or costly commitments. Choose routine technical details within scope. Identify exactly what a blocker prevents and continue independent authorized work. Use `needs_owner_decision` only when the next concrete change is blocked; otherwise keep `in_progress`. Refine reversible details through initial implementation → owner testing → feedback → targeted adjustments. Spend most effort on implementation and relevant verification.

Create Works under Modules and link affected Features. Retrieve `guide planning-procedure` when submitting review or preparing/reconciling a handoff. A brief must be self-contained for agreed scope, cite exact source IDs/paths and a retained source version, and exclude blocked scope. Reconcile changed canonical instructions before refreshing its source. Preserve the exact handed-off version. Source drift is a reason to reconcile, not reopen settled planning.

## Edit and complete proportionally

Mutations require `--agent NAME`; include `--reason TEXT`. Use CLI creation for IDs and paths. Writes require the whole-record hash you read. If it changed, reread and reconcile; never fetch a fresh hash just to force a stale edit through. Use `patch --section TITLE` or `--match-file PATH` for local edits and `write --body-file PATH` for replacements. Unknown HTML boundaries require full reads and exact passage updates.

Before planned implementation or Work completion, retrieve `guide completion`. Set Work to `in_progress` at the start. After delivery, update affected current statements, record remaining work and concise executed checks with evidence references, and keep detailed dated history separate. Review each affected Feature and supply its current hash plus an update/no-change explanation to `complete`. Pending checks leave Work awaiting verification; `accepted_limitations` requires direct owner instruction. Do not use `update-work --status completed`. Historical acknowledgements describe past delivery, not proof of current behavior.

Address requested comments and use `review resolve` with one informative answer; this posts the answer and marks the thread addressed. Use `review reply` only when discussion still needs work or owner input. Resolution is not approval. Preserve frontmatter and required headings; run `check` after direct Markdown edits. Use plain prose, ATX headings, flat lists, and ordinary links. Retrieve `guide formatting` when needed; do not restyle retained versions or quotations.

Use `guide mapping` before initial product mapping, `guide commands` for examples, and `guide reference` for the full reference. `--repo PATH` always identifies the application root containing `.reduct/`.

## Bugs

Create a `bug` under its owning Feature, never under a Module. Keep all bug information in that single document: report, expected and actual behavior, reproduction evidence, investigation, fix plan, decisions, progress, implementation outcome, and verification. Do not create a separate Work, Analysis, implementation brief, or bug document for the same bug. Add sections only when needed. Use `update-bug` for status and `complete` with actual verification and affected-Feature acknowledgements. Bugs use red styling, support comments and retained versions, and follow the closed-record history toggle. Ordinary Works still belong to Modules.

Automatic retention reuses unchanged document text. Do not request a snapshot for every edit or status update; use explicit checkpoints only when the owner requests one or a meaningful handoff needs an exact version. Review submission saves one version; History groups duplicate text without deleting existing evidence.

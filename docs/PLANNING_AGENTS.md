# Reduct planning agents

An agent started in this directory is a planning and documentation agent. Follow the application's parent instructions. Read `agent/README.md` for roles, authority, selective context access, and editing safeguards. Retrieve `reduct guide mapping` for first setup, `guide planning-procedure` for review or handoff, and `guide completion` for planned implementation or completion. Use `source_repository` to locate the application in staged workspaces.

Start with `context ID --current`. Read applicable constraints, relevant Feature sections, and task-relevant open discussions. Retrieve supporting investigation and historical evidence only when needed. Partial reads do not establish knowledge of the full record; reconcile current hashes before edits.

Keep the problem, desired result, current status, and next action visible within the first screen. Create Works directly under Modules and link affected Features; missing Feature documentation does not block authorized work. Features describe delivered behavior; proposed changes belong in Work's `## Plan`. Keep shared decisions canonical and reference their IDs and sections. Use only necessary sections. Ordinary Works aim for 200–400 words and Features for 150–350; these are advisory targets, never gates.

Clarify essential behavior, then proceed toward implementation. Ask only about material scope, essential behavior, data protection, or costly commitments. Choose routine details within scope. State what a blocker prevents and continue independent scope. Keep `in_progress` while implementation can proceed. Reversible details follow initial implementation → owner testing → feedback → targeted adjustments.

Update current statements instead of appending corrections. Keep dated delivery evidence and superseded descriptions in clearly labelled history available on demand. Preserve retained versions, discussion history, attribution, and exact owner quotations. A copied implementation brief must be self-contained, traceable to canonical decisions and a retained source version, and exclude blocked scope.

Use plain paragraphs, ATX headings, flat lists, ordinary links, and separate source references. Preserve frontmatter and required headings. Use guarded section or exact-passage patches and run `check` after direct Markdown edits. Address comments with `review resolve` and one informative answer; use `review reply` only for discussion still needing work or owner input.

## Bugs

Create a `bug` under its owning Feature, never under a Module. Keep all bug information in that single document: report, expected and actual behavior, reproduction evidence, investigation, fix plan, decisions, progress, implementation outcome, and verification. Do not create a separate Work, Analysis, implementation brief, or bug document for the same bug. Add sections only when needed. Use `update-bug` for status and `complete` with actual verification and affected-Feature acknowledgements. Bugs use red styling, support comments and retained versions, and follow the closed-record history toggle. Ordinary Works still belong to Modules.

Automatic retention reuses unchanged document text. Do not request a snapshot for every edit or status update; use explicit checkpoints only when the owner requests one or a meaningful handoff needs an exact version. Review submission saves one version; History groups duplicate text without deleting existing evidence.

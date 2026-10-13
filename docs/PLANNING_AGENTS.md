# Reduct planning agents

An agent started in this directory is a planning and documentation agent. Follow the application's parent instructions. Read the compact `agent/README.md` for roles, boundaries, record access, and edits. Retrieve detailed procedures with `reduct guide TOPIC` or `agent/reference/README.md` when needed: `mapping` for first setup, `planning-procedure` for review and handoff, and `completion` for planned implementation and completion.

Resolve requests by stable record ID, Markdown path, or title. Use `list` to locate records and `context ID --compact` to identify required reading. Read the target, applicable parent constraints, linked features, supporting evidence, and open reviews; batch required reads with `read-many --format text`. Reuse exact content already read in this session only after checking its hash. For staged workspaces use `source_repository` to find the application. Reconcile changed content before edits and report record paths, unresolved decisions, and evidence limits. Use section or exact-passage patches for local changes. Read the guide's deeper procedures only when performing those operations.

## Document formatting

Keep new and revised product documents simple and easy to comment on. Use plain paragraphs, ATX headings (`#`, `##`, `###`), flat bullet or numbered lists, occasional bold emphasis, single-line inline code, and ordinary Markdown links. Use LF line endings and spaces instead of tabs. Keep inline formatting within one line.

Prefer prose and short lists. Avoid blockquotes, nested lists, tables, task checkboxes, HTML, images, diagrams, and decorative formatting. If a code example is necessary, use a fenced block starting at column one, with spaces for indentation; keep it outside lists and blockquotes. Keep source references in a separate section.

Preserve required record headings, YAML frontmatter, stable IDs, and evidence. Apply these conventions to current drafts; do not reformat retained versions, rewrite discussion history, or alter exact owner quotations. See `reduct guide formatting` or Document formatting in `agent/reference/README.md` for the shared convention.

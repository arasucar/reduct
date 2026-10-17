# Changelog

Release notes for `@arasucar/reduct`. Versions before 1.0 may change the CLI, library, or workspace format; check the notes before upgrading.

## 0.2.1 — 2026-10-17

- New Works belong directly to Modules and link affected Features. Workspace sync reparents legacy Feature-owned Works while preserving IDs, paths, and history.
- Planning guidance separates recorded decisions, implementation blockers, agent choices, and testing observations, with independent scope proceeding through implementation and owner feedback.
- Editing a Work's Plan preserves implementation and verification progress. Questions and testing notes can evolve without invalidating an implementation brief; changed instructions still require reconciliation.
- The reader distinguishes implementation blockers from observations for owner testing.

## 0.2.0 — 2026-10-13

- Compact agent entrypoint with the full installed reference and on-demand guide topics.
- Filtered record discovery, batched and conditional reads, section reads, and hash-only checks.
- Compact context manifests, deduplicated review output, and changes-only comparisons with full-output options retained.
- Hash-guarded section and exact-passage updates using the existing write, attribution, and approval rules.
- Truncated context includes the complete record manifest and an explicit full-content option.

### Fixed

- Section operations reject HTML outside fenced code to avoid unsafe section boundaries; exact-passage updates remain available.
- Compact context retains historical Plan evidence and unresolved discussions, including snapshots.
- The default guide command accepts shared options without interpreting them as a topic.

## 0.1.2 — 2026-10-12

### Changed

- Selection controls appear inline at the top of Discussion, without a Clear button.
- Documentation explains how to run the source checkout against a chosen workspace.
- Agent guides define a minimal Markdown convention for product records, with LF line endings and simple formatting for passage comments.

### Fixed

- Passage comments support formatted selections and retain readable quotes with exact Markdown source ranges. Existing comments remain compatible.
- Repeated passages stay outdated after edits when their original occurrence cannot be established.
- Code selections preserve nested indentation and handle inline newline padding, tabs, and Windows line endings.
- Passage mapping handles CRLF paragraphs, multiline inline code in blockquotes, and partially consumed indentation tabs in fenced blocks.

## 0.1.1 — 2026-10-12

### Changed

- Dropped Node.js 20 support; the minimum is now Node.js 22.12, with Node.js 24 LTS recommended.

- Refreshed the package README with a direct quick start, current installation instructions, and collapsible troubleshooting.
- Added contributor documentation, release guidance, and package keywords.
- Organized CLI help and made unknown commands and missing option values report actionable errors.

## 0.1.0

Initial public release.

- Repository-local product maps organized into modules and features.
- Work records with embedded plans, supporting analysis, and implementation briefs.
- Local browser reader with search, discussion threads, notifications, and retained version comparisons.
- Agent CLI for record creation, updates, review, handoff history, and completion evidence.
- Workspace initialization and managed guide synchronization.
- JavaScript library with TypeScript declarations.

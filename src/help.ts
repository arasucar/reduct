/** Shared command reference for the CLI's default and explicit help output. */
export const cliHelp = `Reduct — product context, plans, and discussions alongside your code.

Usage
  reduct <command> [arguments] [options]

Getting started
  init                       Initialize a workspace (asks for confirmation)
  ui [--port PORT]           Start the local reader (default: 4310)
  version                    Print the installed version
  help, --help               Show this reference

Read and validate
  check                      Validate workspace records
  guide [TOPIC]              Read agent instructions (default: compact guide)
                             Topics: reference, mapping, roles, workflow, planning-procedure,
                                     completion, formatting, commands
  list [--type TYPE] [--parent ID] [--status STATE] [--search TEXT]
                             Find records without reading their bodies
  hash ID[,ID...]            Read current hashes without record bodies
  read ID [--format text|json] [--section TITLE] [--if-changed HASH]
                             Read a record (default: JSON), or one exact section
  read-many ID[,ID...] [--format text|json] [--known-file PATH]
                             Batch reads; skip bodies already read at those hashes
  context ID [--current | --compact | --full] [--known-file PATH]
                             Current intent, exact target, or expanded bodies; index includes size estimates
  briefing ID [--short]      Prepare context for an agent
  compare ID --revision REV [--changes-only] [--context-lines N]
                             Compare versions; optionally omit unchanged stretches
  review list [ID] [--status open|resolved] [--compact]

Agent commands (require --agent NAME)
  sync                       Update managed guides and migrate legacy Work homes
  create TYPE --title TITLE [--parent ID]
                             Types: module, feature, bug, work, analysis, implementation
                             Work home: Module (--parent MODULE-ID); link affected Features separately
                             Bug home: Feature; report, investigation, fix, and verification stay in the Bug
                             Work: --work-kind enhancement|investigation|maintenance
                                   --workflow simple|extended
  write ID --hash HASH --body-file PATH
  patch ID --hash HASH --body-file PATH (--section TITLE | --match-file PATH)
                             Replace section contents or a unique exact passage
  submit-review ID --hash HASH
  snapshot ID --hash HASH
  update-work ID --hash HASH --status STATE [--workflow simple|extended]
                 [--affected-features ID,ID]
  update-bug ID --hash HASH --status STATE [--affected-features ID,ID]
                             Track a bug directly; complete uses the same evidence checks
  refresh-brief-source ID --hash HASH --plan-hash HASH
  record-approval ID --hash HASH --owner-instruction-file PATH
  record-handoff ID --hash HASH --revision REV --owner-instruction-file PATH
  complete ID --hash HASH --verification passed|pending|accepted_limitations
              --feature-updates-file PATH
              [--owner-instruction-file PATH]
  review reply|resolve|reopen THREAD --hash HASH --body-file PATH

Shared options
  --repo PATH                Application root (default: current directory)
  --agent NAME               Agent attribution for mutations
  --reason TEXT              Explain a document change
  --hash HASH                Current record hash, obtained with read

Examples
  reduct init --repo /path/to/application
  reduct ui --repo /path/to/application --port 4310
  reduct check --repo /path/to/application

Full guide: https://github.com/arasucar/reduct#readme
`;

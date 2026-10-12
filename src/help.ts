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
  read ID                    Read a record as JSON, including its hash
  context ID                 Read related product and discussion context
  briefing ID [--short]      Prepare context for an agent
  compare ID --revision REV  Compare a record with a retained version
  review list [ID] [--status open|resolved]

Agent commands (require --agent NAME)
  sync                       Update unmodified managed guides
  create TYPE --title TITLE [--parent ID]
                             Types: module, feature, work, analysis, implementation
                             Work: --work-kind enhancement|bug|investigation|maintenance
                                   --workflow simple|extended
  write ID --hash HASH --body-file PATH
  submit-review ID --hash HASH
  snapshot ID --hash HASH
  update-work ID --hash HASH --status STATE [--workflow simple|extended]
                 [--affected-features ID,ID]
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

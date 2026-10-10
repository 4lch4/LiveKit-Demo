# On-Call Voice Agent

A LiveKit voice agent reachable from a browser or a phone number: ask "is anything broken?",
and page the owner through Shion on request.

This repo is a single pnpm project: planning notes under `docs/agents/`, the agent at the root.
`pnpm` and `lk agent` commands all run from the repository root, which is the project root.

## Read these before acting

| Doc                                   | Covers                                                          |
| ------------------------------------- | --------------------------------------------------------------- |
| `docs/agents/scope.md`                | The five boxes, the binding cut list, what is out of scope      |
| `docs/agents/architecture.md`         | Worker/tool design, model budget, compose + deploy requirements |
| `docs/agents/commands.md`             | Toolchain setup, `lk` install, bootstrap, test, deploy commands |
| `docs/agents/shion-contract.md`       | The exact Shion API the alert tool posts to                     |
| `docs/agents/livekit-agent-readme.md` | Upstream starter README, kept as API reference                  |

## LiveKit guidance, from the starter

The agent started as LiveKit's `agent-starter-node` template, so its `AGENTS.md` and eight stage
skills came with it. Those still own LiveKit specifics. The skills live at `.agents/skills/` (and
`.claude/skills/`) and load automatically:

- **LiveKit agent skills** — one per stage (reading docs, building, debugging, testing, writing
  scenarios, running simulations, operating). They defer to live docs for API details. Read the
  matching `SKILL.md` before starting that kind of task rather than guessing at an API.
- **Look up API details, don't recall them.** Run `lk docs` before a docs lookup, or use the
  [docs MCP server](https://docs.livekit.io/reference/developer-tools/docs-mcp/). Model IDs, CLI
  flags, and session setup change between SDK releases.
- **Check Node feature parity.** The Node SDK has most, but not all, of the Python SDK's features.
  Verify a feature exists before designing around it.
- **Report gaps.** If LiveKit's docs or tooling let you down, note it and submit it with
  `lk docs submit-feedback`.

Where the rules below and the skills disagree about LiveKit's APIs or tooling, the skills win —
they track the SDK more closely. Where they disagree about what we are building, the rules below
win.

## Before calling agent work done

- **Scenario-first rule.** On any change to instructions, tool descriptions, tasks, workflows, or
  handoffs, write a scenario in `scenarios.yaml` first and iterate until it passes. Never guess at
  what works.
- **Debugger before done.** After changing agent behavior, exercise it with `lk agent debugger`.
  Run `lk agent debugger restart` after every code edit; a running session keeps the old code.
- **Check the toolchain.** `pnpm run typecheck`, `pnpm run lint`, `pnpm run format` before
  committing. `pnpm test` is expected to fail; see the traps section.

## Git workflow

All agent work happens on a branch, and `main` is only ever advanced by a pull request.

- Branch before the first edit. One branch per task.
- Never commit directly to `main`, and never `git push` to it.
- Push the branch and open a PR with `gh pr create`. Never merge it yourself; leave the merge to
  the owner.

An agent must not run `git commit` on `main`, `git checkout main`, `git merge` into `main`, or any
`git push` whose target is `main`. If asked to do so, stop and say why.

Commits use the default global identity, `4lch4 <git@4lch4.email>`, so nothing local needs setting
up and no `git config user.*` is required. Signing is already on globally, so commits are SSH-signed
as `git@4lch4.email` and verify against `~/.ssh/allowed_signers`. Do not set a local identity that
overrides it, and do not run `git commit` with explicit `--author` or `-c user.name`.

## Rules that get violated if ignored

- **Agent work goes on a branch, merged to `main` by PR only.** See "Git workflow" above.
- Scope is fixed. Five boxes, one resume claim each. Do not build outside them, and do not tick
  a box that has not been verified end to end (a real WebRTC session, a real inbound call, a DM
  that actually landed in Discord).
- Never cut the droplet deploy, the phone call, or the Shion alert tool. Cut top-down from the
  table in `docs/agents/scope.md` instead.
- No changes to Shion (`4lch4/Shion`, checkout at `/home/alcha/Development/Projects/Shion/Bot`).
  Its API already fits the alert tool. If you think Shion needs a change, you have misread the
  contract.
- Keep `SHION_URL` as a config value; do not hardcode it in the tool.
- **Never commit `.env.local`.** It holds live Cloud credentials. The starter's `.gitignore` already
  ignores it, so just do not bypass that.

## Environment quirks on this box

Verified 2026-10-10: Ubuntu 26.04.1 LTS x86_64 (codename `resolute`). Upgraded from jammy
during this project, so some third-party apt sources were parked rather than migrated and are
still inert: `github-cli.list.disabled`, `hashicorp.list.disabled`, `microsoft-prod.list.disabled`.
Anything installed via apt that was not in Ubuntu's own archive may be missing or stale.

- `node`, `npm` and `pnpm` come from nvm, which only `~/.zshrc` loads. In a non-interactive
  shell they do not resolve at all and look uninstalled. Run `source ~/.nvm/nvm.sh` first. This
  bites before every `pnpm` command in the repo.
- `lk` 2.18.8 is installed at `/usr/local/bin/lk` and already authenticated to Cloud project
  `on-call`. `~/.livekit/cli-config.yaml` holds the API key and secret — never commit it.
- `lk cloud auth` is interactive and browser-based, so an agent cannot redo it unattended.
- `jq` is **not** installed, which is worth knowing since the LiveKit CLI installer requires it.
  Any command needing `jq` will fail until `sudo apt-get install -y jq`.
- Do not run `corepack enable pnpm`; it would shadow the working global pnpm install with a shim.
- Do not hand-add pnpm to PATH or set `PNPM_HOME`. nvm already covers pnpm, and `~/.zshrc`
  prepends `$PNPM_HOME` to `PATH`, so exporting it moves pnpm off the nvm-managed install.
- Use pnpm, not the installed `bun`. `.npmrc` sets `engine-strict=true` and `package.json`
  requires Node >=24 and pnpm >=10, so a wrong runtime fails the install outright.
- `pnpm` and `lk agent` commands all run from the repo root, which is the project root.

## Traps that produce misleading failures

- **`pnpm test` fails as shipped.** `src/agent.test.ts` is entirely commented out, so vitest exits 1
  with "No test suite found". That is the template default, not a regression. Behavioral coverage
  belongs in `scenarios.yaml` via `lk agent simulate text`. Expect this to look like your change
  broke the suite when it did not.
- **The starter's `pnpm run dev` is `lk agent dev`, and it registers with LiveKit Cloud.** A local
  worker left running steals calls from the droplet worker, and routing depends on which worker
  registered last, so the failure looks random. Stop it before testing the droplet.
- Adding an explicit `agentName` dispatch stops rooms from getting an agent automatically, which
  can break the browser path. Reconfigure the sandbox/playground to request the agent by name,
  and retest the browser path after adding the phone number.
- Inference runs on a $2.50 credit budget, so model choice buys test minutes. The shipped default
  in `src/agent.ts` is `google/gemma-4-31b-it` with Fish Audio TTS, roughly $0.015/min. The cheap
  combo in `docs/agents/architecture.md` is about $0.006/min, so roughly 400 minutes of talking.
  Every simulation run spends real credit too.
- `lk agent simulate` runs against LiveKit Cloud with real inference, which is why the starter's
  Simulations workflow is gated to merges on `main` and not run on every push.
- The phone number is public. Anyone who dials it can trigger a page.
- The agent and Shion share AICGEN00. Set `mem_limit` in compose so an OOM cannot take Shion
  down.

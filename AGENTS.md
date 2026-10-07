# On-Call Voice Agent

A LiveKit voice agent reachable from a browser or a phone number: ask "is anything broken?",
and page the owner through Shion on request.

## Read these before acting

| Doc | Covers |
| --- | --- |
| `docs/agents/scope.md` | The five boxes, the binding cut list, what is out of scope |
| `docs/agents/architecture.md` | Worker/tool design, model budget, compose + deploy requirements |
| `docs/agents/commands.md` | Toolchain setup, `lk` install, bootstrap, test, deploy commands |
| `docs/agents/shion-contract.md` | The exact Shion API the alert tool posts to |

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

## Environment quirks on this box

Verified 2026-10-07: Ubuntu 22.04.5 x86_64.

- `node`, `npm` and `pnpm` come from nvm, which only `~/.zshrc` loads. In a non-interactive
  shell they do not resolve at all and look uninstalled. Run `source ~/.nvm/nvm.sh` first.
- `lk` 2.18.8 is installed at `/usr/local/bin/lk` and already authenticated to Cloud project
  `on-call`. `~/.livekit/cli-config.yaml` holds the API key and secret — never commit it.
- `lk cloud auth` is interactive and browser-based, so an agent cannot redo it unattended.
- `jq` is **not** installed, which is worth knowing since the LiveKit CLI installer requires it.
  Any command needing `jq` will fail until `sudo apt-get install -y jq`.
- Do not run `corepack enable pnpm`; it would shadow the working global pnpm install with a shim.
- Do not hand-add pnpm to PATH or set `PNPM_HOME`. nvm already covers pnpm, and `~/.zshrc`
  prepends `$PNPM_HOME` to `PATH`, so exporting it moves pnpm off the nvm-managed install.
- Use pnpm, not the installed `bun`. Match the starter's own test runner and lint config rather
  than importing new tooling. Shion uses Biome and `bun test`; that is a different project.

## Traps that produce misleading failures

- A local `pnpm run dev` worker left running steals calls from the droplet worker, and routing
  depends on which worker registered last — so the failure looks random. Stop it before testing
  the droplet.
- Adding an explicit `agentName` dispatch stops rooms from getting an agent automatically, which
  can break the browser path. Reconfigure the sandbox/playground to request the agent by name,
  and retest the browser path after adding the phone number.
- Inference runs on a $2.50 credit budget, so model choice buys test minutes. The cheap combo in
  `docs/agents/architecture.md` is roughly 400 minutes; the starter's defaults cost 2.5x more.
- The phone number is public. Anyone who dials it can trigger a page.
- The agent and Shion share AICGEN00. Set `mem_limit` in compose so an OOM cannot take Shion
  down.
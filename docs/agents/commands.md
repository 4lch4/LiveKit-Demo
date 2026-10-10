# Commands

The agent lives in `on-call/` and is already scaffolded. The repo root holds only this doc set
and the local-only plan doc. `node`, `npm`, `pnpm` and `lk` are all installed.

For anything inside `on-call/`, its own `AGENTS.md` and `.agents/skills/` are authoritative and
take precedence over this file. This one covers setup, the box's toolchain quirks, and deploy.

## Layout

- `on-call/` — the agent, vendored from `livekit-examples/agent-starter-node`. Node/TypeScript,
  `pnpm`, vitest + eslint + prettier, `Dockerfile` and `taskfile.yaml` for deploy.
- `docs/agents/` — these notes.

There is no root `package.json` and no workspace manifest. Every `pnpm` command below runs from
`on-call/`.

## Git workflow

Agent work goes on a branch, never on `main`. Push the branch and open a PR; the owner merges it.

```bash
git checkout -b <task-name>      # before the first edit
git add -A && git commit -m "..."
git push -u origin <task-name>
gh pr create --base main
```

`gh` 2.102.0 is installed at `/usr/bin/gh`. Never merge a PR, never push to `main`, and never
commit straight to it.

Commits use the default global identity, `4lch4 <git@4lch4.email>`. No local `user.name` or
`user.email` needs setting, and overriding it would be wrong. `commit.gpgsign` is already `true`
globally with `gpg.format=ssh`, so commits are SSH-signed as `git@4lch4.email` and verify against
the entry already present in `~/.ssh/allowed_signers`. Do not pass `--author` or `-c user.name`.

## Shell and toolchain

Node comes from **nvm**, loaded by `~/.zshrc` (sets `NVM_DIR`, then sources `nvm.sh`). nvm is a
shell function, not a PATH entry, so in a non-interactive shell `node` and `npm` do not resolve
at all — they look uninstalled when they are not:

```bash
source ~/.nvm/nvm.sh    # node -v -> v24.19.0, npm -v -> 12.1.0
```

Source nvm before running `pnpm install` / `pnpm run dev`, otherwise they fail with "command not
found" and look like a broken toolchain. `on-call/.nvmrc` pins Node 24 and `.npmrc` sets
`engine-strict=true`, so an older runtime fails the install rather than warning.

pnpm 12.10.1 is installed globally under Node v24.19.0, so it sits in
`~/.nvm/versions/node/v24.19.0/bin/pnpm` and moves with the active node version. Do not use
`corepack enable pnpm` — corepack 0.35.0 is present but unused, and enabling it would shadow
this install with a shim.

`bun` is also installed (`~/.bun/bin/bun`), but the agent uses pnpm. Do not substitute bun.

Do not add pnpm to PATH by hand. nvm already covers it, and `~/.zshrc` prepends `$PNPM_HOME` to
`PATH` whenever that variable is set, so exporting it moves pnpm off the nvm-managed install. The
store lives at `~/.local/share/pnpm/store/v11`.

## The LiveKit CLI

`lk` **2.18.8** is installed at `/usr/local/bin/lk` on this Ubuntu 26.04 x86_64 box, which is the
minimum version the starter's debugger and `agentName` features need. Auth is already done:
`~/.livekit/cli-config.yaml` holds a linked Cloud project named `on-call` (`p_42v9wzl8lon`,
`wss://on-call-25femfzo.livekit.cloud`), and it is the CLI's `default_project`. That config holds
the API key and secret, so it must never be committed.

Check the install with:

```bash
lk --version
lk cloud auth --help
lk agent list          # agents deployed in the current project
```

The plan doc's `winget install LiveKit.LiveKitCLI` is Windows-only — do not run it here, whatever
the distro. On Linux the install path is LiveKit's own installer, which requires `bash`, `curl`,
`sha256sum` and `jq`, selects the `amd64` build, installs to `/usr/local/bin`, and verifies
release checksums:

```bash
sudo apt-get update && sudo apt-get install -y jq
curl -sSL https://get.livekit.io/cli | bash
```

`lk cloud auth` is interactive and opens a browser, so an agent cannot complete it unattended.
It is already done, but if it ever needs redoing, hand it to the owner rather than trying to
drive it.

## Bootstrap

Already done. For reference, or to scaffold a different agent:

```bash
lk agent init on-call --template agent-starter-node
```

It clones `livekit-examples/agent-starter-node` into `./on-call`, writes `.env.local` from the
linked Cloud project, and prints a console URL. Then:

```bash
cd on-call
pnpm install          # ~20s from a warm store
```

`on-call/.env.local` holds `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and `LIVEKIT_URL` for project
`on-call`. It is gitignored by the starter's own `.gitignore` and must stay that way.
`.env.example` is the committed template with empty values.

Talk to it from the LiveKit dashboard's sandbox "Web Voice Agent" app or the agents playground.
That first WebRTC session is box 1 of the scope.

Verify that a container can reach Shion and that the token works — do this before Friday,
because the alert tool fails in production otherwise. Run on AICGEN00:

```bash
docker run --rm --add-host=host.docker.internal:host-gateway curlimages/curl -s \
  -H "Authorization: Bearer $SHION_API_TOKEN" \
  http://host.docker.internal:3300/v1/status
# expect "status":"ready"
```

## The agent's own commands

From `on-call/`. `dev` is not a plain node process, it is `lk agent dev`, which connects the
worker to LiveKit Cloud.

| Command | What it does |
| --- | --- |
| `pnpm run dev` | `lk agent dev`, hot reload, registered with Cloud |
| `lk agent console` | Talk to it in the terminal, no browser |
| `lk agent debugger start` / `say` / `restart` / `stop` | Drive text turns, print tool calls |
| `node src/main.ts start` | Production mode, no reload |
| `lk agent simulate text --scenarios scenarios.yaml` | Judged conversations against the agent |

`lk agent dev` must be stopped before testing the droplet worker, since two registered workers
makes call routing depend on registration order and the failure looks random.

## Verifying a change

The starter owns the toolchain. Match its scripts rather than importing new tooling. Shion's repo
uses Biome and `bun test`, but that is a different project — do not copy it here.

```bash
cd on-call
pnpm run typecheck     # tsc --noEmit
pnpm run lint          # eslint
pnpm run format:check  # prettier --check, covers .md too
pnpm test              # vitest --run
```

Typecheck, lint and format:check all pass clean as scaffolded. **`pnpm test` fails**, exiting 1
with `No test suite found in src/agent.test.ts` — that file ships fully commented out, including
an example eval that would judge turns with `openai/gpt-4.1-mini`. This is the template default,
not a local regression. Ignore it until real tests exist, and do not mistake it for a broken change.

Behavior is covered by `scenarios.yaml` instead, judged on LiveKit Cloud:

```bash
lk agent simulate text --scenarios scenarios.yaml
```

Per the starter's `AGENTS.md`, write a scenario before changing instructions, tool descriptions,
tasks, workflows, or handoffs, then iterate until it passes. Each run spends real inference
credit. The shipped file covers greeting, grounding, and guardrails only.

CI in `on-call/.github/workflows/`:
- `tests.yml` on pull requests: `typecheck`, `lint`, `format:check`
- `simulations.yml` on merges to `main` only: `lk agent simulate text`
- `template-check.yml` asserts `pnpm-lock.yaml` and `livekit.toml` are untracked, because the
  template ships them untracked. We commit `pnpm-lock.yaml` deliberately for reproducible builds,
  as the starter's README recommends once it is your project. The workflow's grep is anchored to
  the repo root (`^pnpm-lock.yaml$`) so it does not match `on-call/pnpm-lock.yaml` and passes
  here, but it is now meaningless. Delete this workflow rather than leaving it looking enforced.

The starter also ships its own `.agents/skills/` and `.claude/skills/`, plus `CLAUDE.md` and
`GEMINI.md`. Those are loaded automatically for anything under `on-call/` and take precedence
over this file.

## Deploy

Image updates go through the existing GitHub Actions SSH deploy, not a manual build on the
droplet. The compose requirements are in `docs/agents/architecture.md`.

`on-call/Dockerfile` and `on-call/taskfile.yaml` are upstream and unmodified. `lk agent deploy`
targets LiveKit Cloud; the droplet path is the SSH deploy plus compose. Scope allows falling back
to `lk agent create` if the droplet work overruns, at the cost of a weaker infra claim.
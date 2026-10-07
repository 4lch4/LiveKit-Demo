# Commands

Nothing can be built or run from this directory yet. It holds only the plan doc and the notes
under `docs/agents/`. `node`, `npm`, `pnpm` and `lk` are all installed. See below before
concluding otherwise.

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

Node v24.19.0 is the default; v20.17.0 is also installed. Source nvm before running
`pnpm install` / `pnpm run dev`, otherwise they fail with "command not found" and look like a
broken toolchain.

pnpm 12.10.1 is installed globally under Node v24.19.0, so it sits in
`~/.nvm/versions/node/v24.19.0/bin/pnpm` and moves with the active node version. Do not use
`corepack enable pnpm` — corepack 0.35.0 is present but unused, and enabling it would shadow
this install with a shim.

`bun` is also installed (`~/.bun/bin/bun`), but the starter and the plan doc use pnpm. Do not
substitute bun.

Do not add pnpm to PATH by hand. nvm already covers it, and `~/.zshrc` prepends `$PNPM_HOME` to
`PATH` whenever that variable is set, so exporting it moves pnpm off the nvm-managed install. The
store lives at `~/.local/share/pnpm/store/v11`.

## The LiveKit CLI

`lk` **2.18.8** is installed at `/usr/local/bin/lk` on this Ubuntu 22.04 x86_64 box. Auth is
already done: `~/.livekit/cli-config.yaml` holds a linked Cloud project named `on-call`
(`p_42v9wzl8lon`, `wss://on-call-25femfzo.livekit.cloud`), and it is the CLI's `default_project`.
That config holds the API key and secret, so it must never be committed.

Check the install with:

```bash
lk --version
lk cloud auth --help
```

The plan doc's `winget install LiveKit.LiveKitCLI` is Windows-only — do not run it here. On Linux
the install path is LiveKit's own installer, which requires `bash`, `curl`, `sha256sum` and `jq`,
selects the `amd64` build, installs to `/usr/local/bin`, and verifies release checksums:

```bash
sudo apt-get update && sudo apt-get install -y jq
curl -sSL https://get.livekit.io/cli | bash
```

`lk cloud auth` is interactive and opens a browser, so an agent cannot complete it unattended.
It is already done, but if it ever needs redoing, hand it to the owner rather than trying to
drive it.

## Bootstrap

```bash
lk agent init on-call --template agent-starter-node
pnpm install
pnpm run dev
```

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

## Testing

- Unit tests for the health-check logic.
- One case in the starter's eval suite asserting the agent calls `checkServers` when asked
  "is anything broken?".
- The Shion alert loop is tested end to end in the browser until the DM lands in Discord.

The LiveKit starter owns the test runner and lint config. Match the starter's scripts rather
than introducing new tooling. Shion's repo uses Biome and `bun test`, but that is a different
project with a different toolchain — do not copy it here.

## Deploy

Image updates go through the existing GitHub Actions SSH deploy, not a manual build on the
droplet. The compose requirements are in `docs/agents/architecture.md`.

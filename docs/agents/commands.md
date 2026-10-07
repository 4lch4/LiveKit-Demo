# Commands

Nothing can be built or run from this directory yet. It is not a git repository and holds only the
plan doc. `node`, `npm` and `pnpm` are installed; `lk` is not. See below before concluding
otherwise.

## Git workflow

Agent work goes on a branch, never on `main`. Push the branch and open a PR; the owner merges it.

```bash
git checkout -b <task-name>      # before the first edit
git add -A && git commit -m "..."
git push -u origin <task-name>
gh pr create --base main
```

`gh` 2.102.0 is installed at `/usr/bin/gh`. Never merge a PR, never push to `main`, and never
commit straight to it. If the repo is not yet a git repository, `git init -b main` creates it.

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

## Install the CLI

This box is **Ubuntu 22.04 on x86_64**. The plan doc's `winget install LiveKit.LiveKitCLI` is
Windows-only — do not run it here. The Linux path is LiveKit's own installer:

```bash
sudo apt-get update && sudo apt-get install -y jq   # the installer aborts without jq
curl -sSL https://get.livekit.io/cli | bash
lk --version
```

The installer hard-requires `bash`, `curl`, `sha256sum` and `jq`, and aborts with a clear
message if any is missing. **`jq` is the one that is missing on this box**, so install it first
or the install fails immediately. On x86_64 it selects the `amd64` build, installs to
`/usr/local/bin`, elevates with `sudo` on its own when that directory is not writable, verifies
the release checksums, and installs shell completions for bash/zsh/fish.

Then authenticate against the LiveKit Cloud project:

```bash
lk cloud auth
```

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

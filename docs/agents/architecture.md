# Architecture

One Node.js worker on AICGEN00 — the droplet that already runs Shion — serves the browser entry
point. LiveKit Cloud owns WebRTC media and model inference. There is no phone entry point; it
was cut to avoid the cost of a number (see `scope.md`).

```
browser -> room -> token dispatch requests agentName "on-call"
  -> worker joins over LiveKit's WebSocket
  -> LiveKit Inference (STT -> LLM -> TTS)
  -> checkServers | sendAlert -> Shion :3300 -> Discord DM
```

| Component     | Built from                             | Your work                                                              |
| ------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Agent worker  | `agent-starter-node` on `agents-js`    | Instructions, model choices, `agentName`, tools                        |
| Health tool   | new code                               | `checkServers` over `HEALTH_TARGETS`, including Shion's `/v1/status`   |
| Alert tool    | new code + Shion                       | `sendAlert` to `${SHION_URL}/v1/notifications`, confirm before sending |
| Browser entry | LiveKit Meet via `lk token create`     | Nothing to build; the token requests the agent by name                 |
| Deploy        | starter Dockerfile + your compose file | Image push, compose service, env file                                  |

## Tools

Define both with `llm.tool` + zod.

- **`checkServers`** — built, in `src/tools/`. Reads a `HEALTH_TARGETS` JSON env var whose entries
  carry a name, a URL, and an expected status. Checks them in parallel with a 3-second timeout each
  and returns a compact summary meant to be spoken, e.g. "4 of 5 healthy; Shion API timed out".
  Entries need an optional `headers` field so the Shion target can send its bearer token. **Done.**
- **`sendAlert`** — built, in `src/tools/`. Zod params `level` (`info` / `warning` / `critical`,
  defaulting to `info` like Shion) and `text` (max 2,000 chars). POSTs
  `{ source: "on-call-agent", level, text }` to `${SHION_URL}/v1/notifications` with the
  bearer token and a 5-second timeout, treating only a 200 carrying `"status":"delivered"` as a
  delivery.
  401, 422 and 502 each map to a short spoken error. `SHION_URL` and `SHION_API_TOKEN` load
  through their own `loadShionConfig`, so paging works even when `HEALTH_TARGETS` is unset.
  **Done.**
- **`getServerDetail`** — optional follow-up tool for "what's wrong with Shion?": status code,
  latency, last error. Cut first if time is short; see `scope.md`.

The agent must read an alert back and wait for a spoken yes before calling `sendAlert`.

### Why the health tool returns a sentence

The return value of a tool goes into the next prompt, and in voice the model tends to speak it
nearly verbatim. A raw result list forces a formatting pass the model does poorly and burns
latency. `checkServers` returns one short line ("2 of 3 healthy. Problems: database responded
503.") and the instructions tell the agent to report those numbers as given. This follows the
LiveKit tool-design guidance: return speech-ready strings, not payloads.

## Models are a budget decision

The whole project runs on $2.50 of LiveKit inference credit, so model choice decides how many
test minutes remain.

- **Current set** (verified against the models list 2026-10-10): Deepgram Nova-3 STT
  (`deepgram/nova-3`) + GPT-4.1 mini (`openai/gpt-4.1-mini`) + Rime Mist v3 (`rime/mistv3`).
  About $0.006/min, so roughly 400 minutes of talking.
- The starter shipped Gemma 4 31B (`google/gemma-4-31b-it`) with Fish Audio S2.1 Pro and
  AssemblyAI Universal 3.6 Pro, about $0.015/min — roughly 165 minutes.
- Avoid Cartesia Sonic 3 at $0.03/min; it burns the credit in about an hour of testing.
- **`expressive` is now `false`.** Expressive mode requires a TTS model that declares a markup
  dialect, and the supported list is Fish Audio s2.1-pro, Inworld tts-2, Cartesia Sonic, and
  Gemini flash tts. Rime is not among them, so leaving it on with Rime would inject markup the
  provider cannot render. If TTS moves back to Fish Audio, re-enable it and decide then whether
  it is worth the credit.

Check inference usage in the dashboard Saturday night rather than waiting for the agent to go
silent mid-test.

## Networking

The worker dials out to LiveKit over a WebSocket, so the droplet needs no open ports and can
stay tailnet-only. Reaching Shion from inside the agent container needs
`extra_hosts: ["host.docker.internal:host-gateway"]` in the agent's compose file and
`SHION_URL=http://host.docker.internal:3300`.

## Deploy

Image `4lch4/on-call-agent` on Docker Hub, `compose.yaml` (repo root) and `.env` at
`/mnt/volume_apps/apps/on-call` on AICGEN00:

- `restart: unless-stopped`
- `stop_grace_period: 10m` so live calls finish on redeploy. `src/main.ts` sets the SDK's
  `drainTimeout` to 9.5 minutes, so the worker finishes draining before Docker's SIGKILL; the
  SDK default is an hour.
- `extra_hosts: ["host.docker.internal:host-gateway"]`
- `mem_limit: 800m`, so the agent cannot starve Shion on the shared droplet
- no published ports; the worker only dials out

**Memory.** Measured 2026-10-11 on the image, uncapped:

| State                                                         | Container memory |
| ------------------------------------------------------------- | ---------------- |
| Idle, SDK default of four pre-warmed job processes            | ~805 MiB         |
| Idle, `numIdleProcesses: 1` (what `src/main.ts` sets)         | ~515 MiB         |
| One job via `lk dispatch create`, greeting spoken, no speaker | ~630 MiB         |

A job takes the warm process and the SDK spawns a replacement, which is most of the jump. A real
call adds audio and noise cancellation on top, so plan for 700–750 MiB at peak.

AICGEN00 is a 2 GB droplet with about 800 MiB available and, before this project, no swap. The
cap is 800m, at or below what the host has free, so a runaway agent is killed by its own cgroup
(and restarted) instead of the host OOM killer picking Shion or another service. A 2 GB swapfile
on the host (`vm.swappiness=10`) absorbs spikes. Confirm with `docker stats` during the first
real call, and resize the droplet if a call gets near the cap.

The build context is the repo root. The Dockerfile pins pnpm to the `packageManager` version and
copies `pnpm-workspace.yaml` before installing, since that file holds the `allowBuilds`
approvals pnpm needs for `@livekit/local-inference`.

**Deploy is manual for now.** The plan was to reuse Shion's pipeline, but Shion has no SSH
deploy: it publishes images on release-please tags and relies on WUD on the droplet to pull them,
and that path is not currently working. The manual runbook is in `docs/agents/commands.md`. An
automated publish is a possible follow-up, not a scope item.

## Traps

- **A local `pnpm run dev` worker still running steals calls from the droplet worker.** The
  failure looks random because routing depends on which worker registered last. Stop it before
  testing the droplet, or use a second LiveKit project for dev.
- **Explicit dispatch breaks automatic joins.** `src/main.ts` sets `agentName: 'on-call'`, so
  rooms no longer get an agent automatically and a plain sandbox room stays empty. The browser
  path works by minting a token that requests the agent by name; see step 5 of the deploy
  runbook in `commands.md`.
- **Sizing.** LiveKit's 4 cores / 8 GB per worker figure is for 10–25 concurrent jobs; one call
  needs far less. Check free memory on AICGEN00 before deploying and watch `docker stats` on the
  first call, since an OOM kill would take Shion down with it.
- **`HEALTH_TARGETS` is one line.** dotenv does not parse multi-line values, so a pretty-printed
  JSON array silently becomes invalid JSON. The config loader reports the parse position rather
  than failing silently, and the agent says the check is unconfigured rather than inventing a
  result.

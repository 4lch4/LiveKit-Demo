# Architecture

One Node.js worker on AICGEN00 — the droplet that already runs Shion — serves both entry
points. LiveKit Cloud owns the phone number, SIP, WebRTC media, and model inference.

```
call or browser -> room -> dispatch rule requests agentName "on-call"
  -> worker joins over LiveKit's WebSocket
  -> LiveKit Inference (STT -> LLM -> TTS)
  -> checkServers | sendAlert -> Shion :3300 -> Discord DM
```

| Component     | Built from                             | Your work                                                            |
| ------------- | -------------------------------------- | -------------------------------------------------------------------- |
| Agent worker  | `agent-starter-node` on `agents-js`    | Instructions, model choices, `agentName`, tools                      |
| Health tool   | new code                               | `checkServers` over `HEALTH_TARGETS`, including Shion's `/v1/status` |
| Alert tool    | new code + Shion                       | `sendAlert` to `${SHION_URL}/v1/messages`, confirm before sending    |
| Phone entry   | LiveKit Phone Number + dispatch rule   | Buy the number, one JSON rule, caller allowlist                      |
| Browser entry | LiveKit sandbox or agents playground   | Nothing to build                                                     |
| Deploy        | starter Dockerfile + your compose file | Image push, compose service, env file                                |

## Tools

Define both with `llm.tool` + zod.

- **`checkServers`** — built, in `src/tools/`. Reads a `HEALTH_TARGETS` JSON env var whose entries
  carry a name, a URL, and an expected status. Checks them in parallel with a 3-second timeout each
  and returns a compact summary meant to be spoken, e.g. "4 of 5 healthy; Shion API timed out".
  Entries need an optional `headers` field so the Shion target can send its bearer token. **Done.**
- **`sendAlert`** — zod params `level` (`info` / `warning` / `critical`) and `text` (max 2,000
  chars). POSTs `{ source: "on-call-agent", level, text }` to `${SHION_URL}/v1/messages` with
  the bearer token and a 5-second timeout, mapping 401, 422 and 502 to short spoken errors.
  **Not built yet.**
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

Starter Dockerfile, image pushed to Docker Hub, compose file and `.env` at
`/mnt/volume_apps/apps/on-call` on AICGEN00:

- `restart: unless-stopped`
- `stop_grace_period: 10m` so live calls finish on redeploy
- `extra_hosts: ["host.docker.internal:host-gateway"]`
- `mem_limit` set, so the agent cannot starve Shion on the shared droplet
- optionally map the health check on 8081 to the tailnet only

The build context is the repo root, since `package.json` and `pnpm-lock.yaml` now live there:

```bash
docker build -f Dockerfile -t <image> .
```

Reuse the GitHub Actions SSH deploy that Shion already uses, so the agent redeploys the same
way instead of being a manual build on the droplet.

## Traps

- **A local `pnpm run dev` worker still running steals calls from the droplet worker.** The
  failure looks random because routing depends on which worker registered last. Stop it before
  testing the droplet, or use a second LiveKit project for dev.
- **Explicit dispatch breaks the browser path.** Once the worker has an `agentName`, rooms no
  longer get an agent automatically, so the browser sandbox may stop working. Configure the
  frontend or sandbox to request the agent by name, and retest the browser path after adding
  the phone number. `src/main.ts` already sets `agentName: 'on-call'`.
- **The caller number leaks into logs.** Individual dispatch rules name rooms after the caller's
  number. Fine for a personal project.
- **Sizing.** LiveKit's 4 cores / 8 GB per worker figure is for 10–25 concurrent jobs; one call
  needs far less. Check free memory on AICGEN00 before deploying and watch `docker stats` on the
  first call, since an OOM kill would take Shion down with it.
- **The number is public.** Anyone who dials it can trigger a page. Guard with a caller
  allowlist (or a dispatch-rule `pin`) plus confirm-before-send.
- **`HEALTH_TARGETS` is one line.** dotenv does not parse multi-line values, so a pretty-printed
  JSON array silently becomes invalid JSON. The config loader reports the parse position rather
  than failing silently, and the agent says the check is unconfigured rather than inventing a
  result.

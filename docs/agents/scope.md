# Scope

Source of truth: the plan doc (Oct 7, 2026), local-only and gitignored.

## The four boxes

Each box is one resume claim. If a box is not verified, the matching claim stays off the
resume.

- [x] A browser (WebRTC) session is answered with live health data
- [x] Saying "page me about it" triggers a tool call that posts to Shion and lands in Discord
- [x] The worker runs in Docker on the droplet and restarts on its own
- [ ] A public GitHub repo has a README, architecture diagram, and a 60-90 second demo
      recording

The plan had a fifth box, a real phone number reaching the same agent over SIP. The owner cut it
on 2026-10-12 to avoid the cost of a number. See "Out of scope".

## Rules

- Nothing outside these four boxes. The only stretch item is an upstream open-source PR, and
  only after Sunday's proof work is done.
- Do not tick a box because the code exists. The browser box needs a real WebRTC session, the
  alert box a DM that arrived in Discord.
- Never cut the droplet deploy or the Shion alert tool. Those are the resume claims.

## Cut list

Cut from the top down when time runs short.

| Order | Cut                                         | Saves  | Consequence                                                                           |
| ----- | ------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| 1     | Open-source contribution                    | 2-3 h  | Mention as in progress only if an issue was opened                                    |
| 2     | `getServerDetail` tool                      | 45 min | None                                                                                  |
| 3     | Eval test case                              | 45 min | Drop "tested with LiveKit's eval framework"                                           |
| 4     | Observability screenshot and latency number | 45 min | Leave latency out of the bullet                                                       |
| 5     | Custom web frontend                         | n/a    | Never planned; the hosted sandbox or playground is the WebRTC client and still counts |

If the Docker deploy on the droplet overruns 90 minutes, do not fall back to a laptop deploy.
Deploy to LiveKit Cloud with `lk agent create` instead and change the bullet from
"self-hosted" to "deployed on LiveKit Cloud" — a weaker infra story, but still honest.

## Out of scope

- **Phone calls (SIP).** Cut on 2026-10-12 because a LiveKit phone number adds a recurring cost.
  The browser is the only entry point. Nothing in the agent depends on this: adding a number
  later means buying it and one dispatch rule requesting `agentName: "on-call"`, plus a caller
  allowlist or `pin`, since the number would be public. Do not claim telephony on the resume.
- **Outbound calls** ("call me when something breaks"). These need a SIP trunk, which falls
  under the phone cut above.
- **Changes to Shion.** Its API already fits the alert tool; nothing in `4lch4/Shion` needs to
  change.

## Claiming

Write only what shipped. Add a latency number only if it was measured, and add an upstream PR
only as "opened PR #N to livekit/agents-js" with the link — a merge by Monday is unlikely, so
"contributed to" is not accurate.

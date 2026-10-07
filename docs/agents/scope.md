# Scope

Source of truth: `LiveKit On-Call Voice Agent — Weekend Scope.md` (Oct 7, 2026).

## The five boxes

Each box is one resume claim. If a box is not verified, the matching claim stays off the
resume.

- [ ] A browser (WebRTC) session is answered with live health data
- [ ] A real phone number reaches the same agent (SIP)
- [ ] Saying "page me about it" triggers a tool call that posts to Shion and lands in Discord
- [ ] The worker runs in Docker on the droplet and restarts on its own
- [ ] A public GitHub repo has a README, architecture diagram, and a 60–90 second demo
      recording

## Rules

- Nothing outside these five boxes. The only stretch items are a Telnyx trunk and an upstream
  open-source PR, and only after Sunday's proof work is done.
- Do not tick a box because the code exists. The browser box needs a real WebRTC session, the
  phone box a real inbound call, the alert box a DM that arrived in Discord.
- Never cut the droplet deploy, the phone call, or the Shion alert tool. Those three are the
  resume claims.

## Cut list

Cut from the top down when time runs short.

| Order | Cut | Saves | Consequence |
| --- | --- | --- | --- |
| 1 | Open-source contribution | 2–3 h | Mention as in progress only if an issue was opened |
| 2 | Telnyx trunk | 2 h | Claim "LiveKit SIP telephony", not "SIP trunk integration" |
| 3 | `getServerDetail` tool | 45 min | None |
| 4 | Eval test case | 45 min | Drop "tested with LiveKit's eval framework" |
| 5 | Caller allowlist in code | 30 min | Use a `pin` on the dispatch rule instead, one JSON field |
| 6 | Observability screenshot and latency number | 45 min | Leave latency out of the bullet |
| 7 | Custom web frontend | n/a | Never planned; the hosted sandbox or playground is the WebRTC client and still counts |

If the Docker deploy on the droplet overruns 90 minutes, do not fall back to a laptop deploy.
Deploy to LiveKit Cloud with `lk agent create` instead and change the bullet from
"self-hosted" to "deployed on LiveKit Cloud" — a weaker infra story, but still honest.

## Out of scope

- **Outbound calls** ("call me when something breaks"). LiveKit Phone Numbers are inbound-only;
  outbound needs the Telnyx trunk. Note it as the next feature, do not build it this weekend.
- **Changes to Shion.** Its API already fits the alert tool; nothing in `4lch4/Shion` needs to
  change.

## Claiming

Write only what shipped. Add a latency number only if it was measured, and add an upstream PR
only as "opened PR #N to livekit/agents-js" with the link — a merge by Monday is unlikely, so
"contributed to" is not accurate.

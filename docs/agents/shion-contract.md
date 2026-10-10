# Shion contract

The alert tool is the only integration point, and Shion needs no changes for this project.

Shion is a TypeScript/Bun API built on Elysia. Its checkout is at
`/home/alcha/Development/Projects/Shion/Bot` (git `4lch4/Shion`), where the compose file
publishes host port 3300 to container port 3000 — hence `host.docker.internal:3300` from the
agent container.

| Item                              | Value                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Base URL from the agent container | `http://host.docker.internal:3300`                                                                                       |
| Send                              | `POST /v1/messages` with `{ "source", "level", "text" }`                                                                 |
| Fields                            | `source` 1–64 chars (use `on-call-agent`); `level` `info`, `warning` or `critical`, default `info`; `text` 1–2,000 chars |
| Auth                              | `Authorization: Bearer <API_TOKEN>` on every `/v1` route                                                                 |
| Success                           | `200` with `"status":"delivered"`; the Message arrives as a Discord DM to you                                            |
| Failures                          | `401` bad token, `422` schema mismatch, `502` accepted but Discord refused (body carries Discord's code)                 |
| Health                            | `GET /v1/status` returns `ready` or `degraded`                                                                           |

## Agent env vars

- `SHION_URL=http://host.docker.internal:3300`
- `SHION_API_TOKEN` — the same value as Shion's `API_TOKEN`
- `HEALTH_TARGETS` — the JSON target list; its entries need an optional `headers` field because
  the `/v1/status` target also needs the bearer header

Add Shion's own `/v1/status` to `HEALTH_TARGETS` so the agent can report on Shion itself.

Keep the URL in `SHION_URL` rather than hardcoding it in the tool, so moving either service
later is a config change instead of a code change.

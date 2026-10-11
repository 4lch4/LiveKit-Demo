import type { ShionConfig } from '../config.ts';
import { USER_AGENT } from './check-servers.ts';

/** Shion's own ceiling on `text`, per docs/agents/shion-contract.md. */
const MAX_TEXT_CHARS = 2000;

/** Kept short: Shion is local, so anything past this is a hang rather than a page. */
const TIMEOUT_MS = 5000;

export type AlertLevel = 'info' | 'warning' | 'critical';

/**
 * Why a send failed. Every value maps to a spoken message the agent can hand to
 * the user verbatim, because "it didn't work" is not a useful answer on a phone.
 */
export type SendAlertFailure =
  | 'not_configured'
  | 'rejected_credentials'
  | 'rejected_format'
  | 'discord_refused'
  | 'timeout'
  | 'unreachable'
  | 'unexpected';

export type SendAlertResult =
  | { ok: true; /** One short sentence, ready to be spoken. */ message: string }
  | { ok: false; reason: SendAlertFailure; /** What to tell the user, and why. */ message: string };

/**
 * Builds the endpoint from the configured base URL rather than by concatenation,
 * so a trailing slash in `SHION_URL` cannot produce a doubled separator. A base
 * with a path prefix keeps it, since the relative join is resolved against it.
 */
function messagesUrl(baseUrl: string): string {
  return new URL('v1/messages', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

/**
 * Posts one alert to Shion. Never throws: every failure mode becomes a typed
 * result, because the agent has to be able to explain the failure out loud.
 */
export async function sendAlert(
  config: ShionConfig,
  level: AlertLevel,
  text: string,
): Promise<SendAlertResult> {
  if (text.length === 0 || text.length > MAX_TEXT_CHARS) {
    return {
      ok: false,
      reason: 'rejected_format',
      message: `The alert message must be between 1 and ${MAX_TEXT_CHARS} characters. Tell the user the alert could not be sent.`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(messagesUrl(config.url), {
      method: 'POST',
      headers: {
        'user-agent': USER_AGENT,
        // Never log or echo the token, so it stays in the request line only.
        authorization: `Bearer ${config.apiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ source: 'on-call-agent', level, text }),
      signal: controller.signal,
    });

    // Whitespace-insensitive, same as the health check, so "status": "delivered"
    // and "status":"delivered" both count as delivered.
    const body = (await response.text()).replace(/\s+/g, '').toLowerCase();

    if (!response.ok) {
      return { ok: false, ...mapStatus(response.status) };
    }

    if (!body.includes('"status":"delivered"')) {
      // A 200 that is not a delivery is a contract change or a silent failure.
      // Reporting it as "delivered" would be the worst possible answer on a page.
      return {
        ok: false,
        reason: 'unexpected',
        message: `Shion accepted the alert but did not confirm it was delivered. Tell the user the page did not go through.`,
      };
    }

    return { ok: true, message: 'Alert delivered to the owner.' };
  } catch (err) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        reason: 'timeout',
        message: `Shion did not respond within ${TIMEOUT_MS / 1000} seconds. Tell the user the page did not go through.`,
      };
    }

    return {
      ok: false,
      reason: 'unreachable',
      message: `Could not reach Shion: ${(err as Error).message}. Tell the user the page did not go through.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function mapStatus(status: number): { reason: SendAlertFailure; message: string } {
  switch (status) {
    case 401:
      return {
        reason: 'rejected_credentials',
        message: 'Shion rejected the credentials, so the page did not go through.',
      };
    case 422:
      return {
        reason: 'rejected_format',
        message: 'Shion rejected the alert as malformed, so the page did not go through.',
      };
    case 502:
      return {
        reason: 'discord_refused',
        message: 'Shion took the alert but Discord refused to deliver it, so nobody was paged.',
      };
    default:
      return {
        reason: 'unexpected',
        message: `Shion returned an unexpected status ${status}, so the page did not go through.`,
      };
  }
}

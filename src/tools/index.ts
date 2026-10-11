import { llm } from '@livekit/agents';
import { dedent } from '@livekit/agents';
import { z } from 'zod';
import {
  type HealthCheckResult,
  type HealthTarget,
  loadHealthConfig,
  loadShionConfig,
} from '../config.ts';
import { checkAllTargets } from './check-servers.ts';
import { sendAlert } from './send-alert.ts';

/**
 * Renders results as one spoken line. Kept short deliberately: the agent
 * paraphrases this, and a long return value bloats the context window on a
 * voice turn where every token is latency.
 */
function summarize(results: HealthCheckResult[]): string {
  if (results.length === 0) {
    return 'No health targets are configured.';
  }

  const healthy = results.filter((r) => r.healthy);
  const broken = results.filter((r) => !r.healthy);
  const head = `${healthy.length} of ${results.length} healthy`;
  // Naming the full set stops the model from mapping a server the user asked
  // about onto whichever target happens to be configured.
  const scope = `Only these were checked: ${results.map((r) => r.name).join(', ')}. Anything else is not monitored.`;

  if (broken.length === 0) {
    return `${head}. ${scope}`;
  }

  const details = broken.map((r) => `${r.name} ${r.detail}`).join('; ');
  return `${head}. Problems: ${details}. ${scope}`;
}

export function createCheckServersTool() {
  return llm.tool({
    name: 'checkServers',
    description: dedent`
      Check whether the owner's servers are up, by requesting each configured
      health endpoint.

      Call this whenever the user asks whether something is broken, if a server
      is down, or for a status or health check — including phrasings like "is
      anything broken", "check the servers", or "how are the services".

      Do NOT call this for general questions that do not concern server health,
      and do NOT call it to send an alert. When the user describes a problem and
      asks to be paged, skip this and go straight to reading the alert back; they
      have already said what is wrong. This tool only reports; it never pages
      anyone.

      Returns a summary of how many targets are healthy and, for any that are
      not, what went wrong with each. The numbers come from the live check, so
      report them as given. The result names every server that was checked. If
      the user asked about something not named there, it is not monitored: say
      so, and never report another server's result as if it were that one.
    `,
    parameters: z.object({}),
    execute: async () => {
      let config: ReturnType<typeof loadHealthConfig>;
      try {
        config = loadHealthConfig();
      } catch (err) {
        // Surfaced to the LLM so it can tell the user, rather than thrown as an
        // opaque failure the model cannot explain.
        throw new llm.ToolError(
          `The health check is not configured properly: ${(err as Error).message.replace(/\.$/, '')}. ` +
            `Tell the user the agent cannot check servers right now.`,
        );
      }

      const results = await checkAllTargets(config.targets as HealthTarget[]);
      return summarize(results);
    },
  });
}

export function createSendAlertTool() {
  return llm.tool({
    name: 'sendAlert',
    description: dedent`
      Page the owner by sending them a Discord direct message through their
      notification service.

      Call this only when both of these are true: the user explicitly asked for an
      alert, page, or to be notified, and they then said yes after hearing the
      alert read back to them.

      Do NOT call this when the user has only asked whether something is broken,
      or when the agent offered an alert and the user did not ask for one. Do NOT
      call it before the user has heard the level and message and agreed out
      loud. Do NOT call it to report a health check; use checkServers for that.

      Pick the level from what the user described: critical if something is down
      or unreachable, warning if something is degraded or behaving oddly, info
      for anything else. Write the text yourself from what the user described;
      never ask them to dictate it.

      Returns one short sentence saying whether the page went through. If it did
      not, the reason is in the error. Report that outcome to the user as given.
      Never tell the user an alert was sent unless the tool said it was.
    `,
    parameters: z.object({
      level: z
        .enum(['info', 'warning', 'critical'])
        .default('info')
        .describe(
          'Severity: "info" for a note, "warning" for something degraded, "critical" for something down.',
        ),
      text: z
        .string()
        .min(1)
        .max(2000)
        .describe(
          'The message to deliver, written by you from what the user reported, in one or two plain sentences, e.g. "The database is refusing connections."',
        ),
    }),
    execute: async ({ level, text }) => {
      let config: ReturnType<typeof loadShionConfig>;
      try {
        config = loadShionConfig();
      } catch (err) {
        // Surfaced to the LLM so it can tell the user, rather than thrown as an
        // opaque failure the model cannot explain.
        throw new llm.ToolError(
          `Alerting is not configured: ${(err as Error).message.replace(/\.$/, '')}. ` +
            `Tell the user the page could not be sent.`,
        );
      }

      const result = await sendAlert(config, level, text);
      if (!result.ok) {
        throw new llm.ToolError(result.message);
      }

      return result.message;
    },
  });
}

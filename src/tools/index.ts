import { llm } from '@livekit/agents';
import { dedent } from '@livekit/agents';
import { z } from 'zod';
import { type HealthCheckResult, type HealthTarget, loadHealthConfig } from '../config.ts';
import { checkAllTargets } from './check-servers.ts';

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

  if (broken.length === 0) {
    return `${head}: ${results.map((r) => r.name).join(', ')}.`;
  }

  const details = broken.map((r) => `${r.name} ${r.detail}`).join('; ');
  return `${head}. Problems: ${details}.`;
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
      and do NOT call it to send an alert. This tool only reports; it never
      pages anyone.

      Returns a summary of how many targets are healthy and, for any that are
      not, what went wrong with each. The numbers come from the live check, so
      report them as given.
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
          `The health check is not configured properly: ${(err as Error).message}. ` +
            `Tell the user the agent cannot check servers right now.`,
        );
      }

      const results = await checkAllTargets(config.targets as HealthTarget[]);
      return summarize(results);
    },
  });
}

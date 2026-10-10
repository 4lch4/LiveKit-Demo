import { z } from 'zod';

/**
 * One server the agent can check. Entries come from the `HEALTH_TARGETS`
 * environment variable as a JSON array, so adding a server is a config change
 * rather than a code change.
 */
export const healthTargetSchema = z.object({
  name: z.string().describe('Short human-readable name, e.g. "Shion API" or "droplet".'),
  url: z.string().describe('Absolute URL to request, including scheme and port.'),
  /**
   * Substring the response body must contain for the target to count as
   * healthy. Compared case-insensitively. Use the whole body when the target
   * has no meaningful assertion, e.g. a plain 200 on a static page.
   */
  expect: z.string().default('"status":"ready"').describe('Substring the body must contain.'),
  /** Extra headers for this target, e.g. a bearer token for an authenticated endpoint. */
  headers: z.record(z.string(), z.string()).default({}).describe('Extra request headers.'),
  /** Per-request timeout override in milliseconds. */
  timeoutMs: z.number().int().positive().default(3000).describe('Request timeout in ms.'),
});

export type HealthTarget = z.infer<typeof healthTargetSchema>;

export interface HealthCheckResult {
  name: string;
  healthy: boolean;
  /** Round-trip time in milliseconds. Absent when the request never completed. */
  latencyMs?: number;
  /** HTTP status. Absent on a network failure or timeout. */
  status?: number;
  /** Why this target is unhealthy, phrased so the agent can speak it. */
  detail: string;
}

export interface HealthSummary {
  healthyCount: number;
  totalCount: number;
  /** One line per unhealthy target, empty when everything is up. */
  problems: string[];
  results: HealthCheckResult[];
}

/**
 * Parses `HEALTH_TARGETS`, the `SHION_URL` base, and a Shion bearer token out
 * of the environment.
 *
 * `HEALTH_TARGETS` is read fresh on every call rather than cached, so a config
 * change does not require a worker restart in development.
 */
export function loadHealthConfig(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.HEALTH_TARGETS;
  if (!raw) {
    throw new Error('HEALTH_TARGETS is not set. It must be a JSON array of health targets.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`HEALTH_TARGETS is not valid JSON: ${(err as Error).message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('HEALTH_TARGETS must be a JSON array of health targets.');
  }

  const targets = parsed.map((entry, index) => {
    const result = healthTargetSchema.safeParse(entry);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'entry'}: ${issue.message}`)
        .join('; ');
      throw new Error(`HEALTH_TARGETS[${index}] is invalid — ${issues}`);
    }
    return result.data;
  });

  return {
    targets,
    shionUrl: env.SHION_URL,
    shionApiToken: env.SHION_API_TOKEN,
  };
}

export type HealthConfig = ReturnType<typeof loadHealthConfig>;

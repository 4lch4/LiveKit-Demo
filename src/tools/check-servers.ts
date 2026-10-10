import type { HealthCheckResult, HealthTarget } from '../config.ts';

const USER_AGENT = 'on-call-agent/1.0 (+livekit-agents)';

/**
 * Checks a single target. Never throws: every failure mode becomes an unhealthy
 * result, because the agent's job here is to report status, not to fail.
 */
export async function checkTarget(target: HealthTarget): Promise<HealthCheckResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), target.timeoutMs);

  try {
    const response = await fetch(target.url, {
      method: 'GET',
      headers: { 'user-agent': USER_AGENT, ...target.headers },
      signal: controller.signal,
      redirect: 'follow',
    });

    const latencyMs = Date.now() - startedAt;
    const body = await response.text();

    if (!response.ok) {
      return {
        name: target.name,
        healthy: false,
        latencyMs,
        status: response.status,
        detail: `responded ${response.status}`,
      };
    }

    // Compare without whitespace so "status": "ready" and "status":"ready"
    // both match the default expectation.
    const normalized = body.replace(/\s+/g, '').toLowerCase();
    const expected = target.expect.replace(/\s+/g, '').toLowerCase();

    if (!normalized.includes(expected)) {
      return {
        name: target.name,
        healthy: false,
        latencyMs,
        status: response.status,
        detail: `responded ${response.status} but the body did not match the expected value`,
      };
    }

    return { name: target.name, healthy: true, latencyMs, status: response.status, detail: 'ok' };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const aborted = controller.signal.aborted;

    return {
      name: target.name,
      healthy: false,
      latencyMs,
      detail: aborted
        ? `timed out after ${target.timeoutMs} milliseconds`
        : `could not be reached: ${(err as Error).message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks every target in parallel and returns the full result set. Each target
 * has its own timeout, so one slow server cannot hold up the others.
 */
export async function checkAllTargets(targets: HealthTarget[]): Promise<HealthCheckResult[]> {
  return Promise.all(targets.map((target) => checkTarget(target)));
}

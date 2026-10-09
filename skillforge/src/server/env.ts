/**
 * Read a KOTOMARK_* setting. The pre-rename YURAGI_* names are still accepted as a fallback
 * (KOTOMARK_* wins when both are set) so existing deployments keep working.
 */
export function envVar(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env[`KOTOMARK_${name}`] ?? env[`YURAGI_${name}`];
}

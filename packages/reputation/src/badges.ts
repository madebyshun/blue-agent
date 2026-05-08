const BADGE_BASE_URL = "https://blueagent.dev/badge";

export function builderBadgeUrl(handle: string): string {
  return `${BADGE_BASE_URL}/builder/${encodeURIComponent(handle)}`;
}

export function agentBadgeUrl(handle: string): string {
  return `${BADGE_BASE_URL}/agent/${encodeURIComponent(handle)}`;
}

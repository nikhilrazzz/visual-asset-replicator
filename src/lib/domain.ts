export const ALLOWED_DOMAINS = ["inflooo.com", "makeitviral.ai"] as const;

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  return (ALLOWED_DOMAINS as readonly string[]).includes(email.slice(at + 1).trim().toLowerCase());
}

export const DOMAIN_ERROR =
  "Mafia is only available to @inflooo.com and @makeitviral.ai work accounts.";

/** Mentions are stored as @[Name](uuid). */
export function extractMentionIds(body: string): string[] {
  const ids = new Set<string>();
  for (const m of body.matchAll(/@\[[^\]]*\]\(([0-9a-f-]{36})\)/g)) if (m[1]) ids.add(m[1]);
  return [...ids];
}

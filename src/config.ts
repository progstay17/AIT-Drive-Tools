export interface AppConfig {
  baseUrl: string;
  token?: string;
}

import { resolveProfileSync } from "./profile-store.js";

export function loadConfig(env: NodeJS.ProcessEnv = process.env, profileName?: string): AppConfig {
  const selected = profileName || env.AIT_DRIVE_PROFILE;
  const useProfile = !!(profileName || env.AIT_DRIVE_PROFILE || !env.AIT_DRIVE_URL);
  const profile = useProfile ? resolveProfileSync(selected) : null;
  const raw = (profile?.baseUrl || env.AIT_DRIVE_URL)?.trim();
  if (!raw) throw new Error("AIT_DRIVE_URL is not set and no active profile exists. Run: ait-drive auth login --profile <name>, or set AIT_DRIVE_URL and AIT_DRIVE_TOKEN.");
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error("AIT_DRIVE_URL must be a valid absolute URL."); }
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("AIT_DRIVE_URL must use HTTP or HTTPS.");
  if (parsed.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error("Non-local Gateway connections must use HTTPS.");
  }
  return { baseUrl: parsed.toString().replace(/\/$/, ""), token: profile ? profile.token : env.AIT_DRIVE_TOKEN?.trim() || undefined };
}

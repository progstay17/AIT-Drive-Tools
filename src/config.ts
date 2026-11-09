export interface AppConfig {
  baseUrl: string;
  token?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const raw = env.AIT_DRIVE_URL?.trim();
  if (!raw) throw new Error("AIT_DRIVE_URL is not set. Set it to your AIT Drive Gateway URL.");
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error("AIT_DRIVE_URL must be a valid absolute URL."); }
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("AIT_DRIVE_URL must use HTTP or HTTPS.");
  if (parsed.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error("Non-local Gateway connections must use HTTPS.");
  }
  return { baseUrl: parsed.toString().replace(/\/$/, ""), token: env.AIT_DRIVE_TOKEN?.trim() || undefined };
}

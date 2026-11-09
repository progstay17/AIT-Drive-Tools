import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface ProfileMetadata { baseUrl: string; protectedToken: string; }
export interface ProfileStore { activeProfile?: string; profiles: Record<string, ProfileMetadata>; }
const serviceDir = () => process.env.APPDATA ? join(process.env.APPDATA, "ait-drive") : join(homedir(), ".config", "ait-drive");
const storePath = () => join(serviceDir(), "profiles.json");

export function validateProfileName(name: string): string {
  const value = name.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/.test(value)) throw new Error("Nama profile hanya boleh berisi huruf, angka, minus, dan underscore (maks. 32 karakter).");
  return value;
}
function runDpapi(mode: "protect" | "unprotect", value: string): string {
  if (process.platform !== "win32") throw new Error("Penyimpanan profile terenkripsi saat ini memakai Windows DPAPI. Di OS lain, gunakan AIT_DRIVE_URL dan AIT_DRIVE_TOKEN melalui secret manager.");
  const script = mode === "protect"
    ? "$plain=[Console]::In.ReadToEnd(); $secure=ConvertTo-SecureString -String $plain -AsPlainText -Force; $secure | ConvertFrom-SecureString"
    : "$cipher=[Console]::In.ReadToEnd(); $secure=ConvertTo-SecureString -String $cipher; $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }";
  const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    input: value, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error("Windows DPAPI gagal memproses kredensial profile.");
  return String(result.stdout || "").trim();
}
export async function readProfileStore(): Promise<ProfileStore> {
  try {
    const parsed = JSON.parse(await readFile(storePath(), "utf8")) as ProfileStore;
    if (!parsed || typeof parsed.profiles !== "object" || !parsed.profiles) return { profiles: {} };
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { profiles: {} };
    throw new Error("File profile AIT Drive tidak bisa dibaca atau formatnya rusak.");
  }
}
async function writeStore(store: ProfileStore): Promise<void> {
  await mkdir(dirname(storePath()), { recursive: true });
  await writeFile(storePath(), JSON.stringify(store, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
}
export async function saveProfile(name: string, baseUrl: string, token: string): Promise<void> {
  const key = validateProfileName(name);
  const parsed = new URL(baseUrl);
  if (!["https:", "http:"].includes(parsed.protocol) || (parsed.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname))) {
    throw new Error("Gateway harus memakai HTTPS, kecuali localhost.");
  }
  if (!token.trim()) throw new Error("Personal Access Token wajib diisi.");
  const store = await readProfileStore();
  store.profiles[key] = { baseUrl: parsed.toString().replace(/\/$/, ""), protectedToken: runDpapi("protect", token.trim()) };
  store.activeProfile = key;
  await writeStore(store);
}
export async function activateProfile(name: string): Promise<void> {
  const key = validateProfileName(name);
  const store = await readProfileStore();
  if (!store.profiles[key]) throw new Error(`Profile "${key}" tidak ditemukan.`);
  store.activeProfile = key;
  await writeStore(store);
}
export async function deleteProfile(name?: string): Promise<{ name: string; activeProfile?: string }> {
  const store = await readProfileStore();
  const key = name ? validateProfileName(name) : store.activeProfile;
  if (!key || !store.profiles[key]) throw new Error("Profile tidak ditemukan.");
  delete store.profiles[key];
  if (store.activeProfile === key) store.activeProfile = Object.keys(store.profiles).sort()[0];
  await writeStore(store);
  return { name: key, activeProfile: store.activeProfile };
}
export async function listProfiles() {
  const store = await readProfileStore();
  return { activeProfile: store.activeProfile || null, profiles: Object.keys(store.profiles).sort().map((name) => ({ name, gateway: store.profiles[name].baseUrl, active: name === store.activeProfile })) };
}
export async function resolveProfile(name?: string) {
  const store = await readProfileStore();
  const key = name || store.activeProfile;
  if (!key) return null;
  const profile = store.profiles[key];
  if (!profile) throw new Error(`Profile "${key}" tidak ditemukan.`);
  return { baseUrl: profile.baseUrl, token: runDpapi("unprotect", profile.protectedToken), profile: key };
}

export function resolveProfileSync(name?: string) {
  let store: ProfileStore;
  try { store = JSON.parse(readFileSync(storePath(), "utf8")) as ProfileStore; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("File profile AIT Drive tidak bisa dibaca atau formatnya rusak.");
  }
  const key = name || store.activeProfile;
  if (!key) return null;
  const profile = store.profiles && store.profiles[key];
  if (!profile) throw new Error(`Profile "${key}" tidak ditemukan.`);
  return { baseUrl: profile.baseUrl, token: runDpapi("unprotect", profile.protectedToken), profile: key };
}

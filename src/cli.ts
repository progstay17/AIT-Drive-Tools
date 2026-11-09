#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { GatewayClient } from "./gateway.js";
import { createTransferReporter, finishTransfer, startFeedback } from "./feedback.js";
import { activateProfile, deleteProfile, listProfiles, saveProfile } from "./profile-store.js";

const program = new Command();
program.name("ait-drive").description("Manage AIT Drive from a terminal or AI agent").version("0.2.0").option("--json", "Print machine-readable JSON").option("--profile <name>", "Use a named profile instead of the active profile");
const client = () => new GatewayClient(loadConfig(process.env, program.opts().profile));
const feedbackStops = new WeakMap<Command, (success?: boolean, detail?: string) => void>();
let activeFeedbackStop: ((success?: boolean, detail?: string) => void) | undefined;
let transferLabel = "";
let transferReporter: ReturnType<typeof createTransferReporter> | undefined;

program.hook("preAction", (_thisCommand, actionCommand) => {
  const parts: string[] = [];
  let current: Command | null = actionCommand;
  while (current && current !== program) {
    if (current.name()) parts.unshift(current.name());
    current = current.parent ?? null;
  }
  const commandPath = parts.join(" ");
  if (commandPath === "auth login") return;
  const labels: Record<string, string> = {
    "auth list": "Memuat daftar profile",
    "auth switch": "Mengganti profile aktif",
    "auth status": "Memeriksa sesi dan akun",
    "auth logout": "Logout dari profile",
    "config": "Memeriksa konfigurasi",
    "account": "Mengambil informasi akun",
    "files list": "Memuat daftar file",
    "files search": "Mencari file",
    "files mkdir": "Membuat folder",
    "files rename": "Mengganti nama item",
    "files move": "Memindahkan item",
    "files move-many": "Memindahkan beberapa item",
    "files delete": "Memindahkan item ke Trash",
    "files trash list": "Memuat Trash",
    "files trash restore": "Memulihkan item dari Trash",
    "upload": "Menyiapkan upload",
    "upload-folder": "Memindai folder dan menyiapkan upload",
    "download": "Menghubungi Gateway dan menyiapkan download",
    "share": "Membuat share link",
    "share-many": "Membuat beberapa share link",
    "export-search": "Mencari file dan mengekspor CSV"
  };
  const stop = startFeedback(labels[commandPath] || `Menjalankan ${commandPath || "perintah"}`);
  feedbackStops.set(actionCommand, stop);
  activeFeedbackStop = stop;
});

program.hook("postAction", (_thisCommand, actionCommand) => {
  const stop = feedbackStops.get(actionCommand);
  if (stop) stop(process.exitCode !== 1);
  if (activeFeedbackStop === stop) activeFeedbackStop = undefined;
  transferLabel = "";
  transferReporter = undefined;
});


const auth = program.command("auth").description("Manage encrypted local AIT Drive profiles");
auth.command("login").description("Add or replace a named profile").requiredOption("--profile <name>").action(async (opts) => {
  try {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const gatewayUrl = (await rl.question("Gateway URL (https://...): ")).trim();
    rl.close();
    const token = await hiddenPrompt("Personal Access Token (input hidden): ");
    const candidate = new GatewayClient({ baseUrl: gatewayUrl.replace(/\/+$/, ""), token });
    const stopValidation = startFeedback("Memvalidasi PAT ke Gateway");
    let account;
    try { account = await candidate.me(); stopValidation(true, "token valid"); }
    catch (error) { stopValidation(false, "validasi gagal"); throw error; }
    const stopSave = startFeedback("Menyimpan profile terenkripsi");
    try { await saveProfile(opts.profile, gatewayUrl, token); stopSave(true); }
    catch (error) { stopSave(false); throw error; }
    output({ ok: true, profile: opts.profile, gateway: gatewayUrl.replace(/\/+$/, ""), account: account.name, active: true, credentialStorage: "Windows DPAPI" });
  } catch (error) { fail(error); }
});
auth.command("list").description("List saved profiles without exposing credentials").action(async () => {
  try { output(await listProfiles()); } catch (error) { fail(error); }
});
auth.command("switch").description("Switch the active profile").argument("<name>").action(async (name) => {
  try { await activateProfile(name); output({ ok: true, activeProfile: name }); } catch (error) { fail(error); }
});
auth.command("status").description("Show active profile and authenticated account").action(async () => {
  try {
    const profiles = await listProfiles();
    const account = await client().me();
    output({ activeProfile: profiles.activeProfile, gateway: loadConfig(process.env, program.opts().profile).baseUrl, account });
  } catch (error) { fail(error); }
});
auth.command("logout").description("Remove a local profile; optionally revoke its PAT first").option("--profile <name>", "Profile to remove (defaults to active)").option("--revoke", "Revoke this PAT on the Gateway before removing the local profile").action(async (opts) => {
  try {
    if (opts.revoke) {
      const cfg = loadConfig({}, opts.profile || program.opts().profile);
      await new GatewayClient(cfg).revokeSelf();
    }
    const result = await deleteProfile(opts.profile || program.opts().profile);
    output({ ok: true, loggedOut: result.name, activeProfile: result.activeProfile || null, revokedOnGateway: Boolean(opts.revoke) });
  } catch (error) { fail(error); }
});

program.command("config").description("Validate local connection configuration").action(() => {
  try { const c = loadConfig(process.env, program.opts().profile); output({ ok: true, gateway: c.baseUrl, tokenConfigured: Boolean(c.token), tokenAuth: c.token ? "bearer" : "not-configured" }); }
  catch (error) { fail(error); }
});
program.command("account").description("Show authenticated account and current permissions").action(async () => {
  try { output(await client().me()); } catch (error) { fail(error); }
});

const files = program.command("files").description("File and folder operations");
files.command("list").description("List a folder").option("--path <path>", "Drive-relative path", "").action(async (opts) => {
  try { output(await client().list(opts.path)); } catch (error) { fail(error); }
});
files.command("search").description("Search files by name").requiredOption("--query <text>").action(async (opts) => {
  try { output(await client().search(opts.query)); } catch (error) { fail(error); }
});
files.command("mkdir").description("Create a folder").option("--path <path>", "Parent folder", "").requiredOption("--name <name>").action(async (opts) => {
  try { output({ path: opts.path, name: opts.name, ...(await client().mkdir(opts.path, opts.name)) }); } catch (error) { fail(error); }
});
files.command("rename").description("Rename a file or folder").requiredOption("--path <path>").requiredOption("--new-name <name>").option("--yes", "Confirm the operation").option("--dry-run", "Show the plan without changing files").action(async (opts) => {
  if (!authorizeMutation(opts, "rename", { path: opts.path, newName: opts.newName })) return;
  try { output({ path: opts.path, newName: opts.newName, ...(await client().rename(opts.path, opts.newName)) }); } catch (error) { fail(error); }
});
files.command("move").description("Move a file or folder").requiredOption("--path <path>").requiredOption("--dest <folder>").option("--yes", "Confirm the operation").option("--dry-run", "Show the plan without changing files").action(async (opts) => {
  if (!authorizeMutation(opts, "move", { path: opts.path, destination: opts.dest })) return;
  try { output({ path: opts.path, destination: opts.dest, ...(await client().move(opts.path, opts.dest)) }); } catch (error) { fail(error); }
});
files.command("move-many").description("Move multiple files or folders to one destination").requiredOption("--paths <paths...>").requiredOption("--dest <folder>").option("--yes", "Confirm the operation").option("--dry-run", "Show the plan without changing files").action(async (opts) => {
  if (!authorizeMutation(opts, "move-many", { paths: opts.paths, destination: opts.dest })) return;
  try { output(await client().moveMany(opts.paths, opts.dest)); } catch (error) { fail(error); }
});
files.command("delete").description("Move a file or folder to Trash").requiredOption("--path <path>").option("--yes", "Confirm the operation").option("--dry-run", "Show the plan without changing files").action(async (opts) => {
  if (!authorizeMutation(opts, "delete-to-trash", { path: opts.path })) return;
  try { output({ path: opts.path, ...(await client().delete(opts.path)) }); } catch (error) { fail(error); }
});
const trash = files.command("trash").description("List and restore deleted items");
trash.command("list").description("List Trash items").action(async () => {
  try { output(await client().trash()); } catch (error) { fail(error); }
});
trash.command("restore").description("Restore a Trash item to its original path").requiredOption("--id <id>").action(async (opts) => {
  try { output(await client().restore(opts.id)); } catch (error) { fail(error); }
});

program.command("upload").description("Upload one local file to AIT Drive").requiredOption("--local <file>").option("--to <folder>", "Destination folder in Drive", "").action(async (opts) => {
  try {
    const result = await client().upload(opts.local, opts.to, (loaded, total) => showProgress(opts.local, loaded, total));
    finishProgress(); output({ local: resolve(opts.local), destination: opts.to, ...result });
  } catch (error) { finishProgress(); fail(error); }
});
program.command("upload-folder").description("Recursively upload a local folder and its subfolders").requiredOption("--local <folder>").option("--to <folder>", "Destination folder in Drive", "").option("--yes", "Confirm the bulk upload").option("--dry-run", "Preview files and total size without uploading").action(async (opts) => {
  try {
    const api = client();
    const plan = await api.planUploadFolder(opts.local, opts.to);
    if (!authorizeMutation(opts, "upload-folder", {
      source: plan.source, target: plan.targetRoot, fileCount: plan.fileCount,
      directoryCount: plan.directoryCount, totalBytes: plan.totalBytes, skipped: plan.skipped
    })) return;
    const result = await api.uploadFolder(opts.local, opts.to, (relative, loaded, total) => showProgress(relative, loaded, total));
    finishProgress(); output(result);
  } catch (error) { finishProgress(); fail(error); }
});
program.command("download").description("Download a file or folder ZIP to the local machine").requiredOption("--path <drive-path>").requiredOption("--to <local-path>").option("--overwrite", "Replace an existing local file").action(async (opts) => {
  try {
    const result = await client().download(opts.path, opts.to, Boolean(opts.overwrite), (loaded, total) => showProgress(opts.path, loaded, total));
    finishProgress(); output(result);
  } catch (error) { finishProgress(); fail(error); }
});
program.command("share").description("Create a read-only share link for a file or folder ZIP").requiredOption("--path <path>").option("--days <days>", "Expiry in days", "7").action(async (opts) => {
  try {
    const days = Number(opts.days);
    if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error("--days must be an integer from 1 to 30.");
    output(await client().share(opts.path, days));
  } catch (error) { fail(error); }
});
program.command("share-many").description("Create multiple share links; use --dry-run to preview").requiredOption("--paths <paths...>").option("--days <days>", "Expiry in days", "7").option("--yes", "Confirm creation of all share links").option("--dry-run", "Preview paths without creating links").action(async (opts) => {
  const days = Number(opts.days);
  if (!Number.isInteger(days) || days < 1 || days > 30) return fail(new Error("--days must be an integer from 1 to 30."));
  if (!authorizeMutation(opts, "create-share-links", { paths: opts.paths, days })) return;
  try { output(await client().shareMany(opts.paths, days)); } catch (error) { fail(error); }
});
program.command("export-search").description("Export search results as a CSV spreadsheet").requiredOption("--query <text>").requiredOption("--to <local-path>").action(async (opts) => {
  try {
    const result = await client().search(opts.query);
    const columns = ["name", "path", "type", "size", "mtime"] as const;
    const cell = (value: unknown) => {
      const raw = value == null ? "" : String(value);
      return /[",\r\n]/.test(raw) ? '"' + raw.replace(/"/g, '""') + '"' : raw;
    };
    const csv = [columns.join(","), ...result.items.map((item) => columns.map((key) => cell(item[key])).join(","))].join("\r\n") + "\r\n";
    const destination = resolve(opts.to);
    await writeFile(destination, csv, { flag: "wx" });
    output({ path: destination, rows: result.items.length, format: "csv" });
  } catch (error) { fail(error); }
});

async function hiddenPrompt(label: string): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Login memerlukan terminal interaktif agar PAT tidak tampil di layar. Jalankan tanpa pipe/redirect.");
  }
  return new Promise((resolve, reject) => {
    let value = "";
    const input = process.stdin;
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") { cleanup(); reject(new Error("Login dibatalkan.")); return; }
        if (char === "\r" || char === "\n") { cleanup(); process.stderr.write("\n"); resolve(value); return; }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    const cleanup = () => { input.off("data", onData); input.setRawMode(false); input.pause(); };
    process.stderr.write(label);
    input.setRawMode(true); input.resume(); input.on("data", onData);
  });
}

function authorizeMutation(opts: { yes?: boolean; dryRun?: boolean }, operation: string, details: unknown): boolean {
  if (opts.dryRun) { output({ dryRun: true, operation, details }); return false; }
  if (!opts.yes) {
    fail(new Error(`Operation "${operation}" changes Drive data. Add --yes to confirm or --dry-run to preview.`));
    return false;
  }
  return true;
}
function showProgress(label: string, loaded: number, total?: number): void {
  activeFeedbackStop?.();
  activeFeedbackStop = undefined;
  if (transferLabel !== label || !transferReporter) {
    if (transferReporter) finishTransfer();
    transferLabel = label;
    transferReporter = createTransferReporter(label);
  }
  transferReporter(loaded, total);
}
function finishProgress(): void {
  if (transferReporter) finishTransfer();
  transferLabel = "";
  transferReporter = undefined;
}
function output(value: unknown) {
  if (program.opts().json || !process.stdout.isTTY) console.log(JSON.stringify(value));
  else console.log(value);
}
function fail(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 1;
}
await program.parseAsync(process.argv);

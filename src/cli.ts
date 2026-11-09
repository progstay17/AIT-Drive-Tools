#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { GatewayClient } from "./gateway.js";

const program = new Command();
program.name("ait-drive").description("Manage AIT Drive from a terminal or AI agent").version("0.2.0").option("--json", "Print machine-readable JSON");
const client = () => new GatewayClient(loadConfig());

program.command("config").description("Validate local connection configuration").action(() => {
  try { const c = loadConfig(); output({ ok: true, gateway: c.baseUrl, tokenConfigured: Boolean(c.token), tokenAuth: c.token ? "bearer" : "not-configured" }); }
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
  try { output({ local: resolve(opts.local), destination: opts.to, ...(await client().upload(opts.local, opts.to)) }); } catch (error) { fail(error); }
});
program.command("upload-folder").description("Recursively upload a local folder and its subfolders").requiredOption("--local <folder>").option("--to <folder>", "Destination folder in Drive", "").option("--yes", "Confirm the bulk upload").option("--dry-run", "Preview files and total size without uploading").action(async (opts) => {
  try {
    const api = client();
    const plan = await api.planUploadFolder(opts.local, opts.to);
    if (!authorizeMutation(opts, "upload-folder", {
      source: plan.source, target: plan.targetRoot, fileCount: plan.fileCount,
      directoryCount: plan.directoryCount, totalBytes: plan.totalBytes, skipped: plan.skipped
    })) return;
    output(await api.uploadFolder(opts.local, opts.to));
  } catch (error) { fail(error); }
});
program.command("download").description("Download a file or folder ZIP to the local machine").requiredOption("--path <drive-path>").requiredOption("--to <local-path>").option("--overwrite", "Replace an existing local file").action(async (opts) => {
  try { output(await client().download(opts.path, opts.to, Boolean(opts.overwrite))); } catch (error) { fail(error); }
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

function authorizeMutation(opts: { yes?: boolean; dryRun?: boolean }, operation: string, details: unknown): boolean {
  if (opts.dryRun) { output({ dryRun: true, operation, details }); return false; }
  if (!opts.yes) {
    fail(new Error(`Operation "${operation}" changes Drive data. Add --yes to confirm or --dry-run to preview.`));
    return false;
  }
  return true;
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

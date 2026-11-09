#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { GatewayClient } from "./gateway.js";

const program = new Command();
program.name("ait-drive").description("Manage AIT Drive from a terminal or AI agent").version("0.1.0").option("--json", "Print machine-readable JSON");
program.command("config").description("Validate local connection configuration").action(() => {
  try { const c = loadConfig(); output({ ok: true, gateway: c.baseUrl, tokenConfigured: Boolean(c.token), tokenAuth: "pending-gateway-support" }); }
  catch (error) { fail(error); }
});
const files = program.command("files").description("File and folder operations");
files.command("list").description("List a folder").option("--path <path>", "Drive-relative path", "").action(async (opts) => {
  try { output(await new GatewayClient(loadConfig()).list(opts.path)); } catch (error) { fail(error); }
});
files.command("search").description("Search files by name").requiredOption("--query <text>").action(async (opts) => {
  try { output(await new GatewayClient(loadConfig()).search(opts.query)); } catch (error) { fail(error); }
});
program.command("storage").description("Show storage usage").action(async () => {
  try { output(await new GatewayClient(loadConfig()).stats()); } catch (error) { fail(error); }
});
program.command("share").description("Create a read-only share link for a file or folder ZIP").requiredOption("--path <path>").option("--days <days>", "Expiry in days", "7").action(async (opts) => {
  try {
    const days = Number(opts.days);
    if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error("--days must be an integer from 1 to 30.");
    output(await new GatewayClient(loadConfig()).share(opts.path, days));
  } catch (error) { fail(error); }
});
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

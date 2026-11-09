import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { GatewayClient } from "./gateway.js";

const server = new Server({ name: "ait-drive", version: "0.2.0" }, { capabilities: { tools: {} } });
const client = () => new GatewayClient(loadConfig());
const confirmSchema = { confirm: { type: "boolean", description: "Must be true to execute this change." }, dryRun: { type: "boolean", description: "Preview the operation without changing Drive data." } };
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "ait_drive_account_context", description: "Get authenticated account identity and current file permissions. Does not expose credentials.", inputSchema: { type: "object", properties: {} } },
    { name: "ait_drive_list_files", description: "List files and folders in an AIT Drive directory. Paths are relative to the account drive root.", inputSchema: { type: "object", properties: { path: { type: "string", description: "Folder path; empty string means drive root." } } } },
    { name: "ait_drive_search_files", description: "Search accessible AIT Drive files and folders by name.", inputSchema: { type: "object", properties: { query: { type: "string", minLength: 1 } }, required: ["query"] } },
    { name: "ait_drive_storage_stats", description: "Get storage usage for the authenticated AIT Drive account.", inputSchema: { type: "object", properties: {} } },
    { name: "ait_drive_create_folder", description: "Create a folder in AIT Drive.", inputSchema: { type: "object", properties: { path: { type: "string", default: "" }, name: { type: "string", minLength: 1 } }, required: ["name"] } },
    { name: "ait_drive_rename", description: "Rename a file or folder. Requires confirm=true or dryRun=true.", inputSchema: { type: "object", properties: { path: { type: "string", minLength: 1 }, newName: { type: "string", minLength: 1 }, ...confirmSchema }, required: ["path", "newName"] } },
    { name: "ait_drive_move", description: "Move a file or folder. Requires confirm=true or dryRun=true.", inputSchema: { type: "object", properties: { path: { type: "string", minLength: 1 }, dest: { type: "string" }, ...confirmSchema }, required: ["path", "dest"] } },
    { name: "ait_drive_move_many", description: "Move multiple files or folders to one destination. Requires confirm=true or dryRun=true.", inputSchema: { type: "object", properties: { paths: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, maxItems: 100 }, dest: { type: "string" }, ...confirmSchema }, required: ["paths", "dest"] } },
    { name: "ait_drive_delete", description: "Move a file or folder to Trash. Requires confirm=true or dryRun=true.", inputSchema: { type: "object", properties: { path: { type: "string", minLength: 1 }, ...confirmSchema }, required: ["path"] } },
    { name: "ait_drive_list_trash", description: "List deleted items and their recoverable original paths.", inputSchema: { type: "object", properties: {} } },
    { name: "ait_drive_restore_trash", description: "Restore a Trash item to its original path.", inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"] } },
    { name: "ait_drive_upload_file", description: "Stream one local file to an AIT Drive folder.", inputSchema: { type: "object", properties: { localPath: { type: "string", minLength: 1 }, destinationFolder: { type: "string", default: "" } }, required: ["localPath"] } },
    { name: "ait_drive_upload_folder", description: "Recursively upload a local folder and subfolders. Requires confirm=true or dryRun=true.", inputSchema: { type: "object", properties: { localPath: { type: "string", minLength: 1 }, destinationFolder: { type: "string", default: "" }, ...confirmSchema }, required: ["localPath"] } },
    { name: "ait_drive_download_file", description: "Download a Drive file or folder ZIP to a local path. Existing local files are protected unless overwrite=true.", inputSchema: { type: "object", properties: { drivePath: { type: "string", minLength: 1 }, localPath: { type: "string", minLength: 1 }, overwrite: { type: "boolean", default: false } }, required: ["drivePath", "localPath"] } },
    { name: "ait_drive_create_share_link", description: "Create a read-only share link for one file or folder ZIP. Expiry is 1–30 days.", inputSchema: { type: "object", properties: { path: { type: "string" }, days: { type: "integer", minimum: 1, maximum: 30, default: 7 } }, required: ["path"] } },
    { name: "ait_drive_create_share_links", description: "Create multiple share links. Requires confirm=true or dryRun=true and returns per-item results.", inputSchema: { type: "object", properties: { paths: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, maxItems: 100 }, days: { type: "integer", minimum: 1, maximum: 30, default: 7 }, ...confirmSchema }, required: ["paths"] } }
  ]
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const args = request.params.arguments ?? {};
    let result: unknown;
    switch (request.params.name) {
      case "ait_drive_account_context": result = await client().me(); break;
      case "ait_drive_list_files": {
        const input = z.object({ path: z.string().optional().default("") }).parse(args);
        result = await client().list(input.path); break;
      }
      case "ait_drive_search_files": {
        const input = z.object({ query: z.string().min(1) }).parse(args);
        result = await client().search(input.query); break;
      }
      case "ait_drive_storage_stats": result = await client().stats(); break;
      case "ait_drive_create_folder": {
        const input = z.object({ path: z.string().optional().default(""), name: z.string().min(1) }).parse(args);
        result = await client().mkdir(input.path, input.name); break;
      }
      case "ait_drive_rename": {
        const input = z.object({ path: z.string().min(1), newName: z.string().min(1), confirm: z.boolean().optional().default(false), dryRun: z.boolean().optional().default(false) }).parse(args);
        if (input.dryRun) { result = { dryRun: true, operation: "rename", path: input.path, newName: input.newName }; break; }
        if (!input.confirm) throw new Error("Rename changes Drive data. Set confirm=true or dryRun=true.");
        result = await client().rename(input.path, input.newName); break;
      }
      case "ait_drive_move_many": {
        const input = z.object({ paths: z.array(z.string().min(1)).min(1).max(100), dest: z.string(), confirm: z.boolean().optional().default(false), dryRun: z.boolean().optional().default(false) }).parse(args);
        if (input.dryRun) { result = { dryRun: true, operation: "move-many", paths: input.paths, destination: input.dest }; break; }
        if (!input.confirm) throw new Error("Batch move changes Drive data. Set confirm=true or dryRun=true.");
        result = await client().moveMany(input.paths, input.dest); break;
      }
      case "ait_drive_move": {
        const input = z.object({ path: z.string().min(1), dest: z.string(), confirm: z.boolean().optional().default(false), dryRun: z.boolean().optional().default(false) }).parse(args);
        if (input.dryRun) { result = { dryRun: true, operation: "move", path: input.path, destination: input.dest }; break; }
        if (!input.confirm) throw new Error("Move changes Drive data. Set confirm=true or dryRun=true.");
        result = await client().move(input.path, input.dest); break;
      }
      case "ait_drive_delete": {
        const input = z.object({ path: z.string().min(1), confirm: z.boolean().optional().default(false), dryRun: z.boolean().optional().default(false) }).parse(args);
        if (input.dryRun) { result = { dryRun: true, operation: "delete-to-trash", path: input.path }; break; }
        if (!input.confirm) throw new Error("Delete changes Drive data. Set confirm=true or dryRun=true.");
        result = await client().delete(input.path); break;
      }
      case "ait_drive_list_trash": result = await client().trash(); break;
      case "ait_drive_restore_trash": {
        const input = z.object({ id: z.string().min(1) }).parse(args);
        result = await client().restore(input.id); break;
      }
      case "ait_drive_upload_file": {
        const input = z.object({ localPath: z.string().min(1), destinationFolder: z.string().optional().default("") }).parse(args);
        result = await client().upload(input.localPath, input.destinationFolder); break;
      }
      case "ait_drive_upload_folder": {
        const input = z.object({ localPath: z.string().min(1), destinationFolder: z.string().optional().default(""), confirm: z.boolean().optional().default(false), dryRun: z.boolean().optional().default(false) }).parse(args);
        const api = client();
        const plan = await api.planUploadFolder(input.localPath, input.destinationFolder);
        if (input.dryRun) {
          result = { dryRun: true, operation: "upload-folder", target: plan.targetRoot, fileCount: plan.fileCount, directoryCount: plan.directoryCount, totalBytes: plan.totalBytes, skipped: plan.skipped };
          break;
        }
        if (!input.confirm) throw new Error("Folder upload is a bulk operation. Set confirm=true or dryRun=true.");
        result = await api.uploadFolder(input.localPath, input.destinationFolder); break;
      }
      case "ait_drive_download_file": {
        const input = z.object({ drivePath: z.string().min(1), localPath: z.string().min(1), overwrite: z.boolean().optional().default(false) }).parse(args);
        result = await client().download(input.drivePath, input.localPath, input.overwrite); break;
      }
      case "ait_drive_create_share_link": {
        const input = z.object({ path: z.string().min(1), days: z.number().int().min(1).max(30).optional().default(7) }).parse(args);
        result = await client().share(input.path, input.days); break;
      }
      case "ait_drive_create_share_links": {
        const input = z.object({ paths: z.array(z.string().min(1)).min(1).max(100), days: z.number().int().min(1).max(30).optional().default(7), confirm: z.boolean().optional().default(false), dryRun: z.boolean().optional().default(false) }).parse(args);
        if (input.dryRun) { result = { dryRun: true, operation: "create-share-links", paths: input.paths, days: input.days }; break; }
        if (!input.confirm) throw new Error("Batch sharing creates external links. Set confirm=true or dryRun=true.");
        result = await client().shareMany(input.paths, input.days); break;
      }
      default: throw new Error(`Unknown tool: ${request.params.name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] };
  }
});
await server.connect(new StdioServerTransport());

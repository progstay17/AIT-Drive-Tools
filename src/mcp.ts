import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { GatewayClient } from "./gateway.js";

const server = new Server({ name: "ait-drive", version: "0.1.0" }, { capabilities: { tools: {} } });
const client = () => new GatewayClient(loadConfig());
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "ait_drive_list_files", description: "List files and folders in an AIT Drive directory. Paths are relative to the account drive root.", inputSchema: { type: "object", properties: { path: { type: "string", description: "Folder path; empty string means drive root." } } } },
    { name: "ait_drive_search_files", description: "Search accessible AIT Drive files and folders by name.", inputSchema: { type: "object", properties: { query: { type: "string", minLength: 1 } }, required: ["query"] } },
    { name: "ait_drive_storage_stats", description: "Get storage usage for the authenticated AIT Drive account.", inputSchema: { type: "object", properties: {} } },
    { name: "ait_drive_account_context", description: "Get the authenticated account identity and current file permissions. Does not expose credentials.", inputSchema: { type: "object", properties: {} } },
    { name: "ait_drive_create_share_link", description: "Create a read-only share link for one file or folder ZIP. Expiry is 1–30 days.", inputSchema: { type: "object", properties: { path: { type: "string" }, days: { type: "integer", minimum: 1, maximum: 30, default: 7 } }, required: ["path"] } }
  ]
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const args = request.params.arguments ?? {};
    let result: unknown;
    switch (request.params.name) {
      case "ait_drive_list_files": {
        const input = z.object({ path: z.string().optional().default("") }).parse(args);
        result = await client().list(input.path); break;
      }
      case "ait_drive_search_files": {
        const input = z.object({ query: z.string().min(1) }).parse(args);
        result = await client().search(input.query); break;
      }
      case "ait_drive_storage_stats": result = await client().stats(); break;
      case "ait_drive_account_context": result = await client().me(); break;
      case "ait_drive_create_share_link": {
        const input = z.object({ path: z.string().min(1), days: z.number().int().min(1).max(30).optional().default(7) }).parse(args);
        result = await client().share(input.path, input.days); break;
      }
      default: throw new Error(`Unknown tool: ${request.params.name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] };
  }
});
await server.connect(new StdioServerTransport());

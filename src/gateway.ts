import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir as makeDirectory, readdir, rename as renameFile, rm, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { AppConfig } from "./config.js";

export interface DriveItem {
  name: string;
  path?: string;
  type: "file" | "dir";
  size?: number;
  mtime?: number;
}

export interface TrashItem {
  id: string;
  name: string;
  originalPath?: string;
  deletedAt?: number;
  type?: "file" | "dir";
}

export class GatewayClient {
  constructor(private readonly config: AppConfig) {}

  private authHeaders(extra?: HeadersInit): Headers {
    if (!this.config.token) {
      throw new Error("AIT_DRIVE_TOKEN is missing. Create a scoped Personal Access Token from your AIT Drive browser session and set AIT_DRIVE_TOKEN.");
    }
    const headers = new Headers(extra);
    headers.set("Authorization", `Bearer ${this.config.token}`);
    return headers;
  }

  private async request(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
    const headers = this.authHeaders(init.headers);
    return fetch(new URL(path, this.config.baseUrl), {
      ...init, headers, signal: AbortSignal.timeout(timeoutMs)
    });
  }

  private async jsonResult<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(body.error || `Gateway request failed (${response.status}).`);
    return body as T;
  }

  async getJson<T>(path: string): Promise<T> {
    return this.jsonResult<T>(await this.request(path));
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    return this.jsonResult<T>(await this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }));
  }

  async me() {
    return this.getJson<{ id: string; name: string; role: string; quota: number | null; perms: Record<string, boolean>; canAdmin: boolean }>("/api/me");
  }

  async list(path = "") {
    return this.getJson<{ path: string; items: DriveItem[] }>(`/api/list?path=${encodeURIComponent(path)}`);
  }

  async search(query: string) {
    return this.getJson<{ items: DriveItem[] }>(`/api/search?q=${encodeURIComponent(query)}`);
  }

  async stats() {
    return this.getJson<{ total: number; free: number; used: number; trash?: number; quota?: number }>("/api/stats");
  }

  async mkdir(path: string, name: string) {
    return this.postJson<{ ok: true }>("/api/mkdir", { path, name });
  }

  async rename(path: string, newName: string) {
    return this.postJson<{ ok: true }>("/api/rename", { path, newName });
  }

  async move(path: string, dest: string) {
    return this.postJson<{ ok: true }>("/api/move", { path, dest });
  }

  async delete(path: string) {
    return this.postJson<{ ok: true }>("/api/delete", { path });
  }

  async trash() {
    return this.getJson<{ items: TrashItem[] }>("/api/trash");
  }

  async restore(id: string) {
    return this.postJson<{ ok: true; path?: string }>("/api/trash/restore", { id });
  }

  async share(path: string, days = 7) {
    return this.postJson<{ url: string; days: number }>("/api/share", { path, days });
  }

  async shareMany(paths: string[], days = 7) {
    const results: Array<{ path: string; ok: boolean; url?: string; days?: number; error?: string }> = [];
    for (const path of paths) {
      try {
        const result = await this.share(path, days);
        results.push({ path, ok: true, ...result });
      } catch (error) {
        results.push({ path, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { results, succeeded: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length };
  }

  async upload(localPath: string, destinationFolder = "", onProgress?: (loaded: number, total: number) => void) {
    const source = resolve(localPath);
    const info = await stat(source);
    if (!info.isFile()) throw new Error("Upload source must be a regular file.");
    const name = basename(source).replace(/["\r\n]/g, "_");
    const boundary = "----AITDrive" + randomBytes(18).toString("hex");
    const prefix = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    );
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Readable.from((async function* () {
      yield prefix;
      let loaded = 0;
      for await (const chunk of createReadStream(source)) {
        loaded += chunk.length;
        onProgress?.(loaded, info.size);
        yield chunk;
      }
      yield suffix;
    })());
    const headers = this.authHeaders({
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(prefix.length + info.size + suffix.length)
    });
    const url = new URL(`/api/upload?path=${encodeURIComponent(destinationFolder)}`, this.config.baseUrl);
    const init = {
      method: "POST", headers, body,
      signal: AbortSignal.timeout(30 * 60 * 1000),
      duplex: "half"
    } as unknown as RequestInit & { duplex: "half" };
    const response = await fetch(url, init);
    return this.jsonResult<{ saved: string[] }>(response);
  }

  async planUploadFolder(localPath: string, destinationFolder = "") {
    const root = resolve(localPath);
    const rootInfo = await stat(root);
    if (!rootInfo.isDirectory()) throw new Error("Upload folder source must be a directory.");
    const directories: string[] = [];
    const files: Array<{ localPath: string; relativePath: string; size: number }> = [];
    const skipped: string[] = [];
    const walk = async (current: string, relative = ""): Promise<void> => {
      const entries = await readdir(current, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const childPath = resolve(current, entry.name);
        const childRelative = relative ? relative + "/" + entry.name : entry.name;
        if (entry.isSymbolicLink()) { skipped.push(childRelative); continue; }
        if (entry.isDirectory()) {
          directories.push(childRelative);
          await walk(childPath, childRelative);
        } else if (entry.isFile()) {
          const info = await stat(childPath);
          files.push({ localPath: childPath, relativePath: childRelative, size: info.size });
          if (files.length > 5000) throw new Error("Folder upload is limited to 5,000 files per run.");
        } else {
          skipped.push(childRelative);
        }
      }
    };
    await walk(root);
    const rootName = basename(root);
    const targetRoot = [destinationFolder.replace(/^\/+|\/+$/g, ""), rootName].filter(Boolean).join("/");
    return {
      source: root, rootName, destinationFolder, targetRoot, directories, files, skipped,
      fileCount: files.length, directoryCount: directories.length + 1,
      totalBytes: files.reduce((sum, file) => sum + file.size, 0)
    };
  }

  async uploadFolder(
    localPath: string,
    destinationFolder = "",
    onProgress?: (relativePath: string, loaded: number, total: number) => void
  ) {
    const plan = await this.planUploadFolder(localPath, destinationFolder);
    await this.mkdir(destinationFolder, plan.rootName);
    for (const relative of plan.directories) {
      const parts = relative.split("/");
      const name = parts.pop()!;
      const parent = [plan.targetRoot, ...parts].filter(Boolean).join("/");
      await this.mkdir(parent, name);
    }
    const results: Array<{ path: string; ok: boolean; saved?: string[]; error?: string }> = [];
    for (const file of plan.files) {
      const parent = file.relativePath.includes("/") ? file.relativePath.slice(0, file.relativePath.lastIndexOf("/")) : "";
      const target = [plan.targetRoot, parent].filter(Boolean).join("/");
      try {
        const uploaded = await this.upload(file.localPath, target, (loaded, total) => onProgress?.(file.relativePath, loaded, total));
        results.push({ path: file.relativePath, ok: true, saved: uploaded.saved });
      } catch (error) {
        results.push({ path: file.relativePath, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return {
      targetRoot: plan.targetRoot, directoriesCreated: plan.directoryCount,
      filesUploaded: results.filter((x) => x.ok).length,
      filesFailed: results.filter((x) => !x.ok).length,
      bytesPlanned: plan.totalBytes, skipped: plan.skipped, results
    };
  }

  async moveMany(paths: string[], destination: string) {
    const results: Array<{ path: string; ok: boolean; error?: string }> = [];
    for (const path of paths) {
      try {
        await this.move(path, destination);
        results.push({ path, ok: true });
      } catch (error) {
        results.push({ path, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { results, succeeded: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length };
  }

  async download(drivePath: string, localPath: string, overwrite = false, onProgress?: (loaded: number, total?: number) => void) {
    const destination = resolve(localPath);
    try {
      await stat(destination);
      if (!overwrite) throw new Error("Local destination already exists. Pass --overwrite to replace it.");
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const response = await this.request(`/api/download?path=${encodeURIComponent(drivePath)}`, {}, 30 * 60 * 1000);
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || `Gateway request failed (${response.status}).`);
    }
    if (!response.body) throw new Error("Gateway returned an empty download stream.");
    await makeDirectory(dirname(destination), { recursive: true });
    const temporary = destination + ".ait-drive-part";
    await rm(temporary, { force: true });
    try {
      const totalHeader = Number(response.headers.get("content-length"));
      const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : undefined;
      let loaded = 0;
      const progress = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          loaded += chunk.length;
          onProgress?.(loaded, total);
          callback(null, chunk);
        }
      });
      await pipeline(
        Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
        progress,
        createWriteStream(temporary, { flags: "wx" })
      );
      if (overwrite) await rm(destination, { force: true });
      await renameFile(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    const saved = await stat(destination);
    return { path: destination, bytes: saved.size };
  }
}

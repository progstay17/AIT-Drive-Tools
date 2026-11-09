import type { Writable } from "node:stream";

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function startFeedback(label: string, stream: Writable & { isTTY?: boolean } = process.stderr): (success?: boolean, detail?: string) => void {
  const started = Date.now();
  const tty = Boolean(stream.isTTY);
  let frame = 0;
  let finished = false;

  if (!tty) {
    stream.write(`[AIT Drive] ${label}...\n`);
  } else {
    stream.write(`${frames[0]} ${label}`);
  }

  const timer = tty ? setInterval(() => {
    if (finished) return;
    const elapsed = formatDuration(Date.now() - started);
    frame = (frame + 1) % frames.length;
    stream.write(`\r\u001b[2K${frames[frame]} ${label} (${elapsed})`);
  }, 100) : undefined;
  timer?.unref();

  return (success = true, detail = "") => {
    if (finished) return;
    finished = true;
    if (timer) clearInterval(timer);
    const elapsed = formatDuration(Date.now() - started);
    const status = success ? "✓" : "✗";
    const suffix = detail ? ` — ${detail}` : "";
    if (tty) stream.write(`\r\u001b[2K${status} ${label} (${elapsed})${suffix}\n`);
    else stream.write(`[AIT Drive] ${status} ${label} (${elapsed})${suffix}\n`);
  };
}

export function createTransferReporter(label: string, stream: Writable & { isTTY?: boolean } = process.stderr) {
  const started = Date.now();
  let previousAt = started;
  let previousBytes = 0;
  let lastLineAt = 0;
  const tty = Boolean(stream.isTTY);

  return (loaded: number, total?: number) => {
    const now = Date.now();
    if (!tty && now - lastLineAt < 1000 && (!total || loaded < total)) return;
    const elapsed = Math.max(1, now - started);
    const interval = Math.max(1, now - previousAt);
    const speed = Math.max(0, (loaded - previousBytes) * 1000 / interval);
    const percent = total && total > 0 ? Math.min(100, Math.round(loaded / total * 100)) : undefined;
    const eta = total && speed > 0 ? formatDuration((total - loaded) / speed * 1000) : undefined;
    const progress = total ? `${formatBytes(loaded)} / ${formatBytes(total)} (${percent}%)` : formatBytes(loaded);
    const line = `${label}: ${progress} · ${formatBytes(speed)}/s${eta ? ` · ETA ${eta}` : ""}`;
    if (tty) stream.write(`\r\u001b[2K${line}`);
    else stream.write(`[AIT Drive] ${line}\n`);
    previousAt = now;
    previousBytes = loaded;
    lastLineAt = now;
  };
}

export function finishTransfer(stream: Writable & { isTTY?: boolean } = process.stderr): void {
  if (stream.isTTY) stream.write("\n");
}

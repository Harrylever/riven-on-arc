import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Runs sakz-bot's perp scanner alongside Riven's backend, so signals flow to
 * the site without anyone starting it by hand. It launches
 * scripts/perps/sakz_headless.py (scan every 10 min, self-training, outcome
 * tracking, mirror into Postgres) and restarts it if it ever exits.
 *
 * Enabled when SAKZ_DIR points at a sakz-bot checkout (with its Python deps
 * installed). Off otherwise — the rest of Riven doesn't depend on it.
 */
export function startSakzRunner(opts: { databaseUrl?: string } = {}) {
  const sakzDir = process.env.SAKZ_DIR?.trim();
  if (!sakzDir) return { started: false, reason: "SAKZ_DIR not set" };
  if (!existsSync(join(sakzDir, "sakz_engine_scan.py"))) {
    console.warn(`[sakz] SAKZ_DIR=${sakzDir} doesn't look like a sakz-bot checkout — not starting`);
    return { started: false, reason: "sakz-bot not found" };
  }
  const db = opts.databaseUrl ?? process.env.CLAWDEX_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!db) return { started: false, reason: "no database URL" };

  const script = resolve(import.meta.dir, "../../../../scripts/perps/sakz_headless.py");
  const python = process.env.SAKZ_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
  const interval = process.env.SAKZ_SCAN_INTERVAL_S ?? "600";
  let stopped = false;
  let restarts = 0;
  let child: ReturnType<typeof Bun.spawn> | null = null;

  const launch = () => {
    if (stopped) return;
    child = Bun.spawn([python, script, "--interval", interval], {
      env: { ...process.env, CLAWDEX_DATABASE_URL: db, SAKZ_DIR: sakzDir, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const pipe = async (stream: ReadableStream<Uint8Array> | null) => {
      if (!stream) return;
      const dec = new TextDecoder();
      for await (const chunk of stream) {
        for (const line of dec.decode(chunk).split("\n")) {
          // keep Riven's log readable: the runner's own lines, mirrors and errors
          if (/riven\.sakz|Mirrored|Error|Traceback/i.test(line)) console.log(`[sakz] ${line.trim()}`);
        }
      }
    };
    void pipe(child.stdout as ReadableStream<Uint8Array>);
    void pipe(child.stderr as ReadableStream<Uint8Array>);
    void child.exited.then((code) => {
      if (stopped) return;
      restarts++;
      const wait = Math.min(300_000, 5_000 * 2 ** Math.min(6, restarts));
      console.warn(`[sakz] scanner exited (${code}); restarting in ${Math.round(wait / 1000)}s`);
      setTimeout(launch, wait);
    });
    console.log(`[sakz] perp scanner running (every ${interval}s) from ${sakzDir}`);
  };
  launch();

  const stop = () => {
    stopped = true;
    child?.kill();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return { started: true, stop };
}

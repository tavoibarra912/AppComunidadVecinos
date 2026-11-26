import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const options = { skip: process.platform === "win32" };
const script = fileURLToPath(new URL("../../deploy/prune-backups.sh", import.meta.url));

test(
  "backups: conserva las dos copias más recientes y no toca otros archivos",
  options,
  async (t) => {
    const dir = await mkdtemp(path.join(tmpdir(), "comunidad-backups-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const names = [
      "comunidad-20260101T000000Z.tar.gz",
      "comunidad-20260102T000000Z.tar.gz",
      "comunidad-20260103T000000Z.tar.gz",
      "comunidad-20260104T000000Z.tar.gz",
    ];
    for (const [index, name] of names.entries()) {
      const file = path.join(dir, name);
      await writeFile(file, name);
      const when = new Date(Date.UTC(2026, 0, index + 1));
      await utimes(file, when, when);
    }
    await writeFile(path.join(dir, "nota.txt"), "no tocar");
    await writeFile(path.join(dir, "comunidad-20251201T000000Z.log"), "no tocar");

    const result = spawnSync("bash", [script, dir, "2"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      (await readdir(dir)).sort(),
      [names[2], names[3], "nota.txt", "comunidad-20251201T000000Z.log"].sort(),
    );
  },
);

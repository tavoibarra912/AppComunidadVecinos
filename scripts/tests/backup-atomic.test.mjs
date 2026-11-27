import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const options = { skip: process.platform === "win32" };
const realTar =
  process.platform === "win32"
    ? ""
    : spawnSync("sh", ["-c", "command -v tar"], {
        encoding: "utf8",
      }).stdout?.trim();

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "comunidad-backup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ["bin", "data", "uploads", "deploy", "backups"])
    await mkdir(path.join(root, dir), { recursive: true });
  for (const name of ["backup.sh", "prune-backups.sh"])
    await copyFile(
      new URL(`../../deploy/${name}`, import.meta.url),
      path.join(root, "deploy", name),
    );
  await writeFile(path.join(root, "data/penarrubia.db"), "database");
  await writeFile(path.join(root, "uploads/document.pdf"), "document");
  await writeFile(path.join(root, ".env"), "APP_UID=1001\n");
  await writeFile(path.join(root, "deploy/compose.yml"), "services: {}\n");
  await writeFile(
    path.join(root, "bin/docker"),
    '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$TRACE"\n',
    { mode: 0o755 },
  );
  await writeFile(
    path.join(root, "bin/tar"),
    `#!/usr/bin/env bash
if [[ "$1" == "-czf" && "\${FAIL_TAR:-}" == "1" ]]; then
  printf 'parcial' > "$2"
  exit 23
fi
if [[ "$1" == "-tzf" && "\${FAIL_VERIFY:-}" == "1" ]]; then
  exit 24
fi
exec "$REAL_TAR" "$@"
`,
    { mode: 0o755 },
  );
  const trace = path.join(root, "trace.log");
  return {
    root,
    trace,
    run: (extra = {}, kind = "daily") =>
      spawnSync("bash", [path.join(root, "deploy/backup.sh"), kind], {
        encoding: "utf8",
        timeout: 15000,
        env: {
          ...process.env,
          PATH: `${root}/bin:${process.env.PATH}`,
          TRACE: trace,
          REAL_TAR: realTar,
          ...extra,
        },
      }),
  };
}

test("backup: un tar fallido no deja copia publicada ni temporal", options, async (t) => {
  const f = await fixture(t);
  const result = f.run({ FAIL_TAR: "1" });
  assert.notEqual(result.status, 0);
  assert.deepEqual(await readdir(path.join(f.root, "backups/daily")), []);
  const trace = await readFile(f.trace, "utf8");
  assert.match(trace, /stop api/);
  assert.match(trace, /start api/);
});

test("backup: un tar ilegible no se publica", options, async (t) => {
  const f = await fixture(t);
  const result = f.run({ FAIL_VERIFY: "1" });
  assert.notEqual(result.status, 0);
  assert.deepEqual(await readdir(path.join(f.root, "backups/daily")), []);
});

test("backup: un tar verificado se publica sin dejar temporales", options, async (t) => {
  const f = await fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const files = await readdir(path.join(f.root, "backups/daily"));
  assert.equal(files.length, 1);
  assert.equal(files[0], "comunidad-daily.tar.gz");
  const listing = spawnSync(realTar, ["-tzf", path.join(f.root, "backups/daily", files[0])], {
    encoding: "utf8",
  });
  assert.equal(listing.status, 0, listing.stderr);
  assert.ok(listing.stdout.includes("data/penarrubia.db"));
  assert.ok(listing.stdout.includes(".env"));
  assert.ok(!files.some((name) => name.startsWith(".comunidad-")));
});

test(
  "backup: diario y semanal son independientes y una copia fallida conserva la anterior",
  options,
  async (t) => {
    const f = await fixture(t);
    const daily = path.join(f.root, "backups/daily/comunidad-daily.tar.gz");
    const weekly = path.join(f.root, "backups/weekly/comunidad-weekly.tar.gz");
    await mkdir(path.join(f.root, "backups/deploys"));
    const deploy = path.join(f.root, "backups/deploys/comunidad-previous.tar.gz");
    await writeFile(deploy, "deploy anterior");
    assert.equal(f.run({}, "weekly").status, 0);
    const oldWeekly = await readFile(weekly);
    assert.equal(f.run().status, 0);
    const oldDaily = await readFile(daily);
    for (const extra of [{ FAIL_TAR: "1" }, { FAIL_VERIFY: "1" }]) {
      assert.notEqual(f.run(extra).status, 0);
      assert.deepEqual(await readFile(daily), oldDaily);
      assert.deepEqual(await readFile(weekly), oldWeekly);
      assert.deepEqual(await readdir(path.dirname(daily)), ["comunidad-daily.tar.gz"]);
    }
    await writeFile(path.join(f.root, "data/penarrubia.db"), "database nueva");
    assert.equal(f.run().status, 0);
    assert.notDeepEqual(await readFile(daily), oldDaily);
    assert.deepEqual(await readFile(weekly), oldWeekly);
    assert.equal(await readFile(deploy, "utf8"), "deploy anterior");
    const restored = path.join(f.root, "restored");
    await mkdir(restored);
    assert.equal(spawnSync(realTar, ["-xzf", daily, "-C", restored]).status, 0);
    assert.equal(
      await readFile(path.join(restored, "data/penarrubia.db"), "utf8"),
      "database nueva",
    );
    assert.equal(await readFile(path.join(restored, "uploads/document.pdf"), "utf8"), "document");
    assert.equal(await readFile(path.join(restored, ".env"), "utf8"), "APP_UID=1001\n");
  },
);

test("backup: rechaza categorías arbitrarias antes de detener el servicio", options, async (t) => {
  const f = await fixture(t);
  assert.notEqual(f.run({}, "../weekly").status, 0);
  await assert.rejects(readFile(f.trace), /ENOENT/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// La lógica real de shell se ejecuta en Linux con Docker simulado, sin tocar un daemon.
const options = { skip: process.platform === "win32" };
const sha = "a".repeat(40);
const originalEnv =
  "COMUNIDAD_IMAGE=comunidad:previous\nPROVIDER_TOKEN=preserve-this-value\nAPP_UID=1001\n";
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "comunidad-deploy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "releases", sha);
  for (const dir of [
    "bin",
    "data",
    "uploads",
    "deploy",
    `releases/${sha}/scripts`,
    `releases/${sha}/deploy`,
  ])
    await mkdir(path.join(root, dir), { recursive: true });
  await copyFile(
    new URL("../update-vm.sh", import.meta.url),
    path.join(source, "scripts/update-vm.sh"),
  );
  for (const name of [
    "backup.sh",
    "prune-backups.sh",
    "backup.cron",
    "install-backup-schedule.sh",
    "verify-existing-data.mjs",
  ])
    await copyFile(
      new URL(`../../deploy/${name}`, import.meta.url),
      path.join(source, "deploy", name),
    );
  await mkdir(path.join(source, "deploy/systemd"));
  for (const name of [
    "comunidad-backup@.service",
    "comunidad-backup-daily.timer",
    "comunidad-backup-weekly.timer",
  ])
    await copyFile(
      new URL(`../../deploy/systemd/${name}`, import.meta.url),
      path.join(source, "deploy/systemd", name),
    );
  await writeFile(path.join(root, "data/penarrubia.db"), "existing database");
  await writeFile(path.join(root, "data/provider-key"), "existing encryption key");
  await writeFile(path.join(root, "uploads/document.pdf"), "existing upload");
  await writeFile(path.join(root, ".env"), originalEnv);
  await writeFile(path.join(root, "deploy/compose.yml"), "old compose");
  await writeFile(path.join(source, "deploy/compose.yml"), "new compose");
  await writeFile(
    path.join(root, "bin/docker"),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$TRACE"
if [[ "$1 $2" == 'image inspect' ]]; then
  if [[ "\${FAIL_IMAGE:-}" == 1 ]]; then exit 22; fi
  printf '%s' "$IMAGE_REVISION"
fi
if [[ " $* " == *' exec -T api node '* && "\${FAIL_HEALTH:-}" == 1 ]]; then exit 1; fi
if [[ "$1" == run && "\${FAIL_DATA_GUARD:-}" == 1 ]]; then exit 25; fi
`,
    { mode: 0o755 },
  );
  await writeFile(
    path.join(root, "bin/tar"),
    `#!/usr/bin/env bash
if [[ "\${FAIL_BACKUP:-}" == 1 ]]; then exit 23; fi
exec /bin/tar "$@"
`,
    { mode: 0o755 },
  );
  await writeFile(path.join(root, "bin/sleep"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
  const trace = path.join(root, "trace.log");
  return {
    root,
    trace,
    run: (extra = {}, commit = sha) =>
      spawnSync("bash", [path.join(source, "scripts/update-vm.sh"), commit, root], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${root}/bin:${process.env.PATH}`,
          TRACE: trace,
          IMAGE_REVISION: sha,
          ...extra,
        },
        timeout: 10000,
      }),
  };
}

test(
  "VM: verifica la imagen antes de parar, guarda backup y conserva datos y secretos",
  options,
  async (t) => {
    const f = await fixture(t);
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const trace = await readFile(f.trace, "utf8");
    assert.ok(trace.indexOf("image inspect") < trace.indexOf(" stop api"));
    assert.ok(!trace.includes("build --build-arg"));
    assert.ok(trace.indexOf("--network none") < trace.indexOf("up -d --no-deps"));
    assert.ok(trace.includes("APP_REQUIRE_EXISTING_DB=true"));
    assert.equal(
      await readFile(path.join(f.root, "data/penarrubia.db"), "utf8"),
      "existing database",
    );
    assert.ok(trace.includes("up -d --no-deps --pull never api"));
    assert.ok(
      !trace.includes(" start api"),
      "No debe admitir escrituras entre backup y actualización",
    );
    assert.equal(
      await readFile(path.join(f.root, ".env"), "utf8"),
      originalEnv.replace("comunidad:previous", `comunidad:${sha}`),
    );
    assert.equal((await stat(path.join(f.root, ".env"))).mode & 0o777, 0o600);
    assert.equal(
      await readFile(path.join(f.root, "data/provider-key"), "utf8"),
      "existing encryption key",
    );
    assert.equal(
      await readFile(path.join(f.root, "uploads/document.pdf"), "utf8"),
      "existing upload",
    );
    assert.equal((await readFile(path.join(f.root, ".deployed-release"), "utf8")).trim(), sha);
    const [backup] = await readdir(path.join(f.root, "backups/deploys"));
    const entries = spawnSync("tar", ["-tzf", path.join(f.root, "backups/deploys", backup)], {
      encoding: "utf8",
    });
    for (const entry of [
      "data/provider-key",
      "data/penarrubia.db",
      "uploads/document.pdf",
      ".env",
      "deploy/compose.yml",
    ])
      assert.ok(entries.stdout.includes(entry));
  },
);

test("VM: una imagen ausente no detiene ni cambia producción", options, async (t) => {
  const f = await fixture(t);
  assert.notEqual(f.run({ FAIL_IMAGE: "1" }).status, 0);
  assert.ok(!(await readFile(f.trace, "utf8")).includes(" stop api"));
  assert.equal(await readFile(path.join(f.root, ".env"), "utf8"), originalEnv);
});

test(
  "VM: si la nueva versión altera datos, aborta antes del cambio y reinicia la anterior",
  options,
  async (t) => {
    const f = await fixture(t);
    assert.notEqual(f.run({ FAIL_DATA_GUARD: "1" }).status, 0);
    const trace = await readFile(f.trace, "utf8");
    assert.ok(trace.includes(" start api"));
    assert.ok(!trace.includes(" up -d"));
    assert.equal(await readFile(path.join(f.root, ".env"), "utf8"), originalEnv);
    assert.equal(
      await readFile(path.join(f.root, "data/penarrubia.db"), "utf8"),
      "existing database",
    );
    assert.ok(!(await readdir(f.root)).some((name) => name.startsWith(".deploy-check.")));
  },
);

test("VM: rechaza una release que incluya una base local", options, async (t) => {
  const f = await fixture(t);
  await mkdir(path.join(f.root, "releases", sha, "data"));
  await writeFile(path.join(f.root, "releases", sha, "data/penarrubia.db"), "replacement");
  assert.notEqual(f.run().status, 0);
  await assert.rejects(readFile(f.trace), /ENOENT/);
  assert.equal(
    await readFile(path.join(f.root, "data/penarrubia.db"), "utf8"),
    "existing database",
  );
});

test("VM: una imagen de otro commit no detiene ni cambia producción", options, async (t) => {
  const f = await fixture(t);
  assert.notEqual(f.run({ IMAGE_REVISION: "b".repeat(40) }).status, 0);
  assert.ok(!(await readFile(f.trace, "utf8")).includes(" stop api"));
  assert.equal(await readFile(path.join(f.root, ".env"), "utf8"), originalEnv);
});

test("VM: si falla el backup vuelve a arrancar la versión anterior", options, async (t) => {
  const f = await fixture(t);
  assert.notEqual(f.run({ FAIL_BACKUP: "1" }).status, 0);
  const trace = await readFile(f.trace, "utf8");
  assert.ok(trace.includes(" stop api"));
  assert.ok(trace.includes(" start api"));
  assert.ok(!trace.includes(" up -d"));
  assert.equal(await readFile(path.join(f.root, ".env"), "utf8"), originalEnv);
});

test(
  "VM: salud fallida conserva el backup y nunca marca la versión como publicada",
  options,
  async (t) => {
    const f = await fixture(t);
    const result = f.run({ FAIL_HEALTH: "1" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no pasó salud/);
    assert.equal((await readdir(path.join(f.root, "backups/deploys"))).length, 1);
    await assert.rejects(readFile(path.join(f.root, ".deployed-release")), /ENOENT/);
  },
);

test("VM: rechaza un SHA inválido antes de ejecutar Docker", options, async (t) => {
  const f = await fixture(t);
  assert.notEqual(f.run({}, "main; echo injected").status, 0);
  await assert.rejects(readFile(f.trace), /ENOENT/);
});

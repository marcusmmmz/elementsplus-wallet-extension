import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { zip } from "../scripts/zip.mjs";

const files = [
  { name: "wallet/manifest.json", data: Buffer.from(`${JSON.stringify({ version: "0.1.0" })}\n`) },
  { name: "wallet/src/ui/wallet.js", data: Buffer.from("export const x = 1;\n".repeat(200)) },
  { name: "wallet/src/empty.txt", data: Buffer.alloc(0) },
  { name: "wallet/src/random.bin", data: Buffer.from(Array.from({ length: 64 }, (_, i) => (i * 97) & 0xff)) },
];

test("zip output is deterministic", () => {
  assert.deepEqual(zip(files), zip(files.map((file) => ({ ...file, data: Buffer.from(file.data) }))));
});

test("zip extracts to the exact input files", async (t) => {
  if (spawnSync("unzip", ["-v"]).status !== 0) {
    t.skip("unzip is not installed");
    return;
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), "elementsplus-zip-"));
  try {
    await writeFile(path.join(directory, "a.zip"), zip(files));
    const tested = spawnSync("unzip", ["-t", "a.zip"], { cwd: directory, encoding: "utf8" });
    assert.equal(tested.status, 0, tested.stdout + tested.stderr);
    const extracted = spawnSync("unzip", ["-q", "a.zip", "-d", "out"], { cwd: directory, encoding: "utf8" });
    assert.equal(extracted.status, 0, extracted.stderr);
    for (const file of files) assert.deepEqual(await readFile(path.join(directory, "out", file.name)), file.data, file.name);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("zip refuses unsafe or duplicate paths", () => {
  for (const name of ["", "/abs", "a/../b", "a\\b"]) {
    assert.throws(() => zip([{ name, data: Buffer.alloc(1) }]), /Unsafe archive path/u, name);
  }
  assert.throws(() => zip([files[0], files[0]]), /Duplicate archive path/u);
});

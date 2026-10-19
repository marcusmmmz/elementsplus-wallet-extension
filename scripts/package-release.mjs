// `npm run package:release -- --profile ecx-beta [--tag v0.2.0]`: zip the
// already built and checked artifacts in dist/ for testers (see
// docs/INSTALL-TESTERS.md and docs/RELEASING.md).
//
// The Chromium zip holds one unversioned folder, elementsplus-wallet-<profile>/,
// so an update unzipped to the same place keeps the same folder (Chrome keys
// an unpacked extension, and its wallet storage, by folder location). The
// Firefox zip has manifest.json at its root, as "Load Temporary Add-on" needs.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatedDirectory } from "./build-paths.mjs";
import { profileArgument, refuseUnselectable } from "./profile-args.mjs";
import { zip } from "./zip.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const profile = refuseUnselectable(profileArgument(argv));
if (profile.kind !== "public") {
  process.stderr.write("Only public network profiles are packaged for testers.\n");
  process.exit(2);
}
const tagIndex = argv.indexOf("--tag");
const tag = tagIndex >= 0 ? argv[tagIndex + 1] : undefined;

async function readJson(file) {
  return JSON.parse(await readFile(path.join(root, file), "utf8"));
}

// One version everywhere: package.json, both manifest templates, the built
// manifests and, when given, the release tag.
const version = (await readJson("package.json")).version;
const versions = {
  "package.json": version,
  "manifest/chromium.json": (await readJson("manifest/chromium.json")).version,
  "manifest/firefox.json": (await readJson("manifest/firefox.json")).version,
  "dist/chromium/manifest.json": (await readJson("dist/chromium/manifest.json")).version,
  "dist/firefox/manifest.json": (await readJson("dist/firefox/manifest.json")).version,
};
for (const [file, found] of Object.entries(versions)) {
  if (found !== version) throw new Error(`${file} has version ${found}, package.json has ${version}`);
}
if (tag !== undefined && tag !== `v${version}`) throw new Error(`Tag ${tag} does not match version v${version}`);

// The artifact must be the one built for this profile, and pass its checks.
const check = spawnSync(process.execPath, [path.join("scripts", "check-artifact.mjs"), "--profile", profile.id], {
  cwd: root,
  stdio: "inherit",
});
if (check.status !== 0) process.exit(check.status ?? 1);

async function entries(directory, prefix) {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await entries(absolute, `${prefix}${entry.name}/`));
    else if (entry.isFile()) result.push({ name: `${prefix}${entry.name}`, data: await readFile(absolute) });
    else throw new Error(`Artifact contains a non-regular entry: ${absolute}`);
  }
  return result;
}

const output = await generatedDirectory(root, path.join(root, "release"), ["release"]);
await mkdir(output, { recursive: true });
const base = `elementsplus-wallet-${profile.id}-v${version}`;
const archives = [
  [`${base}-chromium.zip`, await entries(path.join(root, "dist", "chromium"), `elementsplus-wallet-${profile.id}/`)],
  [`${base}-firefox.zip`, await entries(path.join(root, "dist", "firefox"), "")],
];
const sums = [];
for (const [name, files] of archives) {
  const archive = zip(files);
  await writeFile(path.join(output, name), archive);
  sums.push(`${createHash("sha256").update(archive).digest("hex")}  ${name}\n`);
}
await writeFile(path.join(output, `${base}-SHA256SUMS.txt`), sums.join(""), "utf8");
process.stdout.write(`Packaged ${profile.id} v${version} into ${path.relative(root, output)}/:\n${sums.join("")}`);

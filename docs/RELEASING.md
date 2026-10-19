# Releasing tester builds

Testers install a zipped, prebuilt artifact with "Load unpacked"
(`docs/INSTALL-TESTERS.md`), not a store listing. A release is a GitHub
pre-release with three assets:

| Asset | Contents |
|---|---|
| `elementsplus-wallet-<profile>-vX.Y.Z-chromium.zip` | one folder, `elementsplus-wallet-<profile>/`, holding `dist/chromium` |
| `elementsplus-wallet-<profile>-vX.Y.Z-firefox.zip` | `dist/firefox` with `manifest.json` at the root (Firefox "Load Temporary Add-on") |
| `elementsplus-wallet-<profile>-vX.Y.Z-SHA256SUMS.txt` | SHA-256 of both zips |

The Chromium folder name has no version on purpose. Chrome derives an unpacked
extension's ID, and with it the wallet's `storage.local` (the encrypted vault),
from the folder's path. A tester who replaces the folder in place keeps
their wallet; loading from another path creates a second, empty wallet, and
**Remove** deletes the vault. The update steps in `INSTALL-TESTERS.md` follow
from this, so keep the folder name stable across releases.

## Cutting a release

1. Set the same version in `package.json`, `manifest/chromium.json` and
   `manifest/firefox.json` (Chrome needs 1–4 dot-separated integers, so no
   `-beta` suffix). Commit on `main`.
2. Tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. `.github/workflows/release.yml` runs the wallet-core tests and `npm run check`,
   builds `ecx-beta`, runs `npm run package:release -- --profile ecx-beta --tag
   v0.2.0` (which refuses mismatched versions or an artifact that fails
   `check-artifact.mjs`), and publishes the pre-release with install notes.

Locally the same zips come from:

```sh
ELEMENTSPLUS_NETWORK_PROFILE=ecx-beta npm run build:profile
npm run package:release -- --profile ecx-beta
```

The zips go to `release/`, which is gitignored. The archive writer
(`scripts/zip.mjs`) is deterministic: same files, same bytes.

## Notes

- Firefox loads unsigned extensions only temporarily, so the wallet is
  gone after every restart. A persistent Firefox build would need a fixed
  `browser_specific_settings.gecko.id` and an unlisted AMO signature.
- The extension has no icon yet; testers see a grey "E".

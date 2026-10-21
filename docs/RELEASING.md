# Releasing a new version

1. Update `version` in `package.json` (e.g. `1.0.1`) and commit.
2. Tag and push: `git tag v1.0.1 && git push origin main v1.0.1`.
3. GitHub Actions (**Release** workflow) builds on macOS, Windows and Linux, runs the tests, verifies the packages and
   uploads installers, auto-update feeds (`latest*.yml`) and `SHA256SUMS-*.txt` to a **draft** release.
4. Check the draft, then **Publish**. Installed apps only see published releases.

## Code signing (later)

Add these repository secrets and re-run a release — no code changes needed:

- **macOS** (Apple Developer ID): `CSC_LINK` (base64 .p12), `CSC_KEY_PASSWORD`, plus `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`; then set `mac.notarize: true` in `electron-builder.yml` and
  `ciInventory.macSigned: true` in `package.json` (turns on fully automatic macOS updates).
- **Windows**: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (or Azure Trusted Signing).

## App icon

Replace `build/icon.png` with a ≥1024×1024 transparent PNG of the official CI symbol (see `build/README.md`).

## Local builds

`npm run dist:mac` · `npm run dist:win` · `npm run dist:linux` — output in `dist/`, checked by `scripts/verify-package.mjs`.
On an Apple-Silicon Mac, the Intel build also needs `npm install --no-save --force @node-rs/argon2-darwin-x64@<version>`.

## Automatic updates

Installed apps can only read **public** GitHub releases (a token inside the app would be a security risk).
Releases currently live in the private repository, so `ciInventory.autoUpdate` is `false` in `package.json` and the
app never contacts GitHub. To enable updates later: publish releases to a public repository (for example a separate
`ci-inventory-releases` repo containing only installers), point `ciInventory.github` at it, set
`ciInventory.autoUpdate: true`, and release a new version.

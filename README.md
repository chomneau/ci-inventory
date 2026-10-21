# CI Inventory

Secure desktop app for CI Cambodia to manage inventory and office supplies (Windows, macOS, Linux).
Electron + React + TypeScript + Tailwind.

## Commands

```bash
npm install
npm run dev          # app with hot reload
npm run typecheck
npm test
npm run build        # bundles into out/
npm run dist:mac     # or dist:win / dist:linux — installers into dist/
```

> If the app crashes with `Cannot read properties of undefined (reading 'isPackaged')`, your terminal has
> `ELECTRON_RUN_AS_NODE=1` set (VS Code's integrated terminal does this). Run `unset ELECTRON_RUN_AS_NODE`.

## Security model (phase 1)

- Renderer is sandboxed with context isolation; no Node APIs. It only sees `window.ci` from `src/preload`.
- Production UI is served from `app://ci` (`src/main/security/protocol.ts`) with a strict CSP and path-traversal protection.
- Navigation, new windows, webviews and all device permissions are denied (`src/main/security/hardening.ts`).
- Every IPC call goes through `src/main/ipc/router.ts`: top-level trusted frame only → Zod validation → sanitized errors.
- Packaged builds flip Electron fuses (`electron-builder.yml`) and refuse to start with remote-debugging switches.

## Data storage (phase 2)

- Local SQLite database encrypted with SQLCipher (AES-256): `<userData>/data/inventory.db`.
  `better-sqlite3` in package.json is an npm alias for `better-sqlite3-multiple-ciphers`; startup fails if encryption is unavailable.
- A random 256-bit key is created on first run and stored only wrapped by the OS keychain (Electron `safeStorage`) in `data/db.key`.
  The database cannot be opened on another machine or user account. On Linux a real keyring is required.
- Dev builds use a separate `CI Inventory (dev)` data folder.
- Schema: `src/main/db/schema.ts`. After changing it run `npx drizzle-kit generate --name <change>`; migrations in `drizzle/` run on startup.
- `audit_log` and `stock_movements` are append-only (DB triggers). The audit log is a SHA-256 hash chain; `verifyAuditChain()` detects edited, removed or truncated rows.

> Unsigned local builds get a new code signature every time, so macOS asks for keychain access on first launch of each build. Signed releases do not.

## Sign-in (phase 3)

- First run creates the administrator; every account must link a phone authenticator (TOTP, RFC 6238) before first use.
- Sign-in: email + password (Argon2id) → 6-digit code from Google/Microsoft Authenticator, or a single-use recovery code.
- 5 failed attempts lock the account (1, 2, 4… up to 60 min). Unknown emails behave identically, so accounts cannot be discovered.
- Session lives only in the main process (`src/main/auth/auth-service.ts`). It locks after 10 min of OS idle time
  (`security.idleLockMinutes` setting), when the screen locks or the PC sleeps, when the window closes, or with Ctrl/Cmd+L.
- Every IPC handler is `authenticated` by default; pass a role list to restrict it, e.g. `handle(ch, schema, fn, ['admin'])`.
- TOTP secrets are AES-256-GCM sealed with a key derived from the database key; recovery codes are stored hashed.

## Inventory (phase 4)

- **Items**: SKU (stored upper-case, unique), English/Khmer names, category, default location, unit, minimum stock, unit cost (integer cents, USD), photo, QR label.
- **Stock ledger**: stock in / out / transfer / count-adjust. Stock on hand is always the sum of append-only movements; stock can never go negative at a location. Every movement is audited.
- **Low stock**: items at or below their minimum are flagged; crossing the threshold shows a desktop notification. Dashboard and the sidebar badge update live.
- **Photos** are decoded and re-encoded to JPEG by Electron (strips metadata and non-image payloads) and stored inside the encrypted database.
- **CSV export** (items, movements) is written by the main process via a save dialog, with a UTF-8 BOM for Excel/Khmer and formula-injection protection. Each export is audited.
- **Roles**: viewers can read and export; admins and storekeepers can change data (enforced in the main process).
- Category and location names are unique regardless of letter case.

> For automated UI tests in a dev build, `CI_INV_DISABLE_IDLE_LOCK=1` disables the idle auto-lock. Packaged builds ignore it.

## Administration (phase 5)

- **Users & roles** (admins): create accounts with a one-time temporary password (shown once), change role, disable/enable,
  unlock, reset password, reset phone link. Rules enforced in main: at least one active admin always remains; admins cannot
  demote, disable or reset themselves.
- **Step-up**: user management, settings, backup and restore require re-entering an authenticator code; it stays valid for
  5 minutes and is cleared on lock/sign-out.
- **Settings**: office name (sidebar, QR labels), idle auto-lock minutes, backup reminder days. Everyone can regenerate their
  own recovery codes (with a code) and see their recent sign-in activity.
- **Encrypted backup** (`.cibackup`): database snapshot + database key, encrypted with AES-256-GCM under an Argon2id key
  from the backup password (header authenticated; KDF cost capped against crafted files). Restorable on a new computer.
- **Restore**: decrypt → integrity check → migrate → audit-chain check → build a new encrypted database → safety copy of
  the current data in `data/pre-restore-<time>/` → swap → restart. Nothing plaintext is written to disk.
- **Audit log** (admins): search, verify the hash chain, export CSV. Unknown-email lockouts now persist across restarts.

> Dev-only test seams (ignored when packaged): `CI_INV_TEST_SAVE_PATH` / `CI_INV_TEST_OPEN_PATH` replace native file dialogs.

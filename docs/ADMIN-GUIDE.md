# CI Inventory — Administrator quick-start

CI Inventory keeps CI Cambodia's office supplies and inventory on this computer, encrypted.
It works fully offline; the only network use is checking GitHub for updates (you can turn that off).

## 1. Install

| Computer | Download | First launch |
|---|---|---|
| Windows 10/11 | `CI-Inventory-<version>-win-x64.exe` | Until the app is code-signed, Windows may show "Windows protected your PC" → **More info → Run anyway**. |
| Mac with Apple chip (M1–M4) | `CI-Inventory-<version>-mac-arm64.dmg` | Until the app is signed: right-click the app → **Open** the first time. |
| Mac with Intel chip | `CI-Inventory-<version>-mac-x64.dmg` | Same as above. |
| Linux (Ubuntu/Debian) | `.deb` (or `.AppImage`) | Needs a keyring (GNOME Keyring or KWallet) — installed automatically with the `.deb`. |

Check a download against `SHA256SUMS-*.txt` on the release page if you want to be sure it is genuine.

## 2. First setup (once per computer)

1. Open CI Inventory → **Set up CI Inventory**: enter your name, email and a password (12+ characters).
2. **Link your phone**: install Google Authenticator or Microsoft Authenticator, scan the QR code, type the 6-digit code.
3. **Save the 10 recovery codes** somewhere safe (printed, in a locked drawer). Each works once if you lose your phone.
4. In **Settings → Organisation**, set the office name.
5. Add locations (e.g. *Main storeroom*), categories, then items.

## 3. Add staff

**Users & roles → New user** → name, email, role:

- **Administrator** — everything, including users, settings, backups and the audit log
- **Storekeeper** — items and stock movements
- **Viewer** — read-only and exports

You'll be asked for your authenticator code, then shown a **temporary password once**. Give it to the person directly.
At first sign-in they link their own phone and choose their own password.

**Lost phone?** Users & roles → 📱 *Reset phone link* on their row. **Forgot password?** 🔑 *Reset password*.
**Locked out after wrong attempts?** It unlocks itself (1 min, 2, 4… up to 60), or use *Unlock*.

## 4. Backups (do this weekly)

**Settings → Backup & restore → Create a backup**: choose a backup password (keep it safe — without it the backup
cannot be opened), then save the `.cibackup` file to a USB drive or shared drive. The dashboard reminds admins when
the last backup is too old.

**Restore** (e.g. on a new computer): install CI Inventory, set it up, then *Settings → Restore from a backup* → enter the
backup password → choose the file → check the summary → *Replace data and restart*. Everyone signs in with their usual
password and phone afterwards. The previous data is kept as a safety copy (last 3 restores).

## 5. Updates

Releases are currently kept in a **private** GitHub repository, so installed apps cannot download updates themselves.
To update, an administrator downloads the new installer from the repository's *Releases* page and installs it over the
existing app — data is kept. (If releases are later published to a public repository, automatic updates can be turned
on: see `docs/RELEASING.md`.)

With automatic updates on: when a new version is downloaded, a bar says **"Version x is ready — Restart to update"**. On unsigned Mac builds it
says **"Version x is available — Download"** instead; install the new `.dmg` over the old app. Admins can turn
automatic checks off in **Settings → Updates**.

## 6. Security in one paragraph

All data is encrypted on disk with a key protected by the operating system's keychain; it can't be read on another
computer or user account (use a backup to move it). Every sign-in requires the password and a code from the phone.
The app locks itself after inactivity (Settings), when the screen locks, or with Ctrl/⌘ + L. Every change is recorded in a
tamper-evident audit log (Audit log → *Verify integrity*).

## 7. Where things are kept

| | macOS | Windows | Linux |
|---|---|---|---|
| Data (encrypted) | `~/Library/Application Support/CI Inventory/data` | `%APPDATA%\CI Inventory\data` | `~/.config/CI Inventory/data` |
| Log file | `…/CI Inventory/logs/main.log` | same folder | same folder |

Uninstalling the app does **not** delete the data.

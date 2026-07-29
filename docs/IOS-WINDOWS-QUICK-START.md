# iPhone + Windows 11 Quick Start

The Mac is needed only to build and sign the IPA. After installation, Windows 11 runs OMP and the bridge. Tailscale connects the Windows host and iPhone remotely.

## 1. Build and install the IPA on a Mac

The Mac must have the repository, either by cloning it or copying the checkout.

Requirements: macOS, Xcode, Node.js 22.12+, an Apple signing team, and a sideloader of your choice.

From the repository root:

```bash
cd web
npm install
npm run build
npm run cap:add:ios       # first generation only
npm run cap:sync:ios
open ios/App/App.xcodeproj
```

In Xcode:

1. Select the App target and choose your Apple signing team.
2. Connect the iPhone, or select **Any iOS Device**.
3. Archive the app and export an IPA.
4. Enable **Developer Mode** on the iPhone if requested.
5. Load the IPA with a sideloader of your choice.
6. Trust the developer profile if prompted: **Settings > General > VPN & Device Management**.

For later builds, skip `npm run cap:add:ios`:

```bash
cd web
npm run build
npm run cap:sync:ios
open ios/App/App.xcodeproj
```

The Mac is not needed after the IPA is installed.

## 2. Prepare Windows 11

Install or verify:

- Node.js 22.12+
- Oh My Pi, with `omp` available in PowerShell
- Git, if cloning the repository on Windows
- Tailscale, for remote access

Verify OMP:

```powershell
omp --version
```

Clone or copy the repository to Windows. The examples below use `C:\harness-remote` and allow the full C drive so any directory accessible to your Windows account can be selected.

## 3. Allow the bridge through Windows Firewall

Run PowerShell as Administrator:

```powershell
New-NetFirewallRule `
  -DisplayName "Harness Remote Bridge" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 4097 `
  -Action Allow `
  -Profile Any
```

Basic Auth still protects the bridge. Do not expose it publicly.

## 4. Start the Windows bridge

Keep this PowerShell window open:

```powershell
Set-Location C:\harness-remote
$env:HARNESS_REMOTE_USERNAME = "omp"
$env:HARNESS_REMOTE_PASSWORD = "your-password"
node .\bridge\src\cli.js `
  --host 0.0.0.0 `
  --port 4097 `
  --root "C:\" `
  --cors capacitor://localhost
```

The bridge should print:

```text
OMP bridge listening on http://0.0.0.0:4097
```

Restart the bridge after changing the password or root. The first configured root is used by **Use server default**. Windows permissions still apply even when the root is `C:\`.

## 5. Verify bridge health

Use `curl.exe`, not plain `curl`:

```powershell
curl.exe -v --user omp http://127.0.0.1:4097/v1/health
```

Enter the bridge password. Expected response:

```json
{"healthy":true,"backend":"omp","version":"..."}
```

A `401 Unauthorized` response means the bridge was reached and the credentials are wrong. `Cannot reach` means the request did not reach the bridge.

## 6. Test a local iPhone connection

Put Windows and the iPhone on the same Wi-Fi network. Run:

```powershell
ipconfig
```

In Harness Remote:

1. Open **Settings**.
2. OMP is already selected in the native iOS app.
3. Set **Host** to the Windows LAN IPv4 address.
4. Set **Port** to `4097`.
5. Enter username `omp` and the bridge password.
6. Tap **Test Connection**.
7. Create a session under `C:\`.

Do not enter `0.0.0.0`, `127.0.0.1`, or `localhost` in the app.

## 7. Install and configure Tailscale

Tailscale must be installed on Windows and iPhone. The IPA-building Mac is not needed.

### Windows

1. Download Tailscale from [tailscale.com/download/windows](https://tailscale.com/download/windows).
2. Run the installer.
3. Open Tailscale from the system tray.
4. Sign in to the tailnet account.
5. Confirm it shows **Connected**.

Verify the Windows Tailscale address:

```powershell
tailscale status
tailscale ip -4
```

### iPhone

1. Install Tailscale from the [App Store](https://apps.apple.com/us/app/tailscale/id1470499037).
2. Sign in with the same account.
3. Allow the VPN configuration.
4. Confirm Windows and iPhone appear in the same tailnet.
5. Leave Tailscale connected.

Tailscale traffic uses a VPN interface. Harness Remote may not appear under iOS **Local Network** settings, and that is not required for Tailscale.

## 8. Use HTTPS for the remote iPhone connection

The native iOS app may reject plain HTTP to a Tailscale `100.x.x.x` address even when Safari can open it. Use Tailscale Serve to provide HTTPS inside the tailnet.

On Windows:

```powershell
tailscale serve --bg http://127.0.0.1:4097
tailscale serve status
```

Tailscale will print an HTTPS hostname, such as:

```text
https://your-pc.your-tailnet.ts.net
```

Test it:

```powershell
curl.exe -v --user omp https://your-pc.your-tailnet.ts.net/v1/health
```

Do not use `tailscale funnel`. Serve is limited to your tailnet.

In Harness Remote, use:

```text
Host: https://your-pc.your-tailnet.ts.net
Port: 443
Username: omp
Password: your bridge password
```

The app supports an HTTPS hostname in the Host field. Use the exact hostname printed by `tailscale serve status`.

## 9. Attach a desktop OMP session with Collab

To share the same desktop OMP session with the terminal and phone:

1. Start an interactive OMP session on Windows.
2. Run `/collab` in that terminal.
3. Copy the generated bearer link.
4. In Harness Remote, choose **Attach OMP Collab**.
5. Enter a display name and paste the link.
6. Close the dialog and open **Sessions**.
7. Select the card named with your display name and labeled **OMP Collab**.

The terminal's join message confirms the handshake. It does not automatically select the card in the app. Direct Bridge sessions and desktop terminal sessions are separate. Collab is the shared-session path.

Use a writable link for prompts and aborts. A room-key-only link is read-only.

## Troubleshooting

- `401 Unauthorized`: the bridge was reached, but the username or password is wrong. Restart the bridge after changing them.
- `Cannot reach`: the request did not reach the bridge. Check Tailscale, the Windows firewall, the bridge terminal, and the Host value.
- Safari reaches the direct `100.x.x.x` URL but the app fails: use Tailscale Serve and configure the app with the HTTPS MagicDNS hostname and port `443`.
- The Collab card appears briefly and disappears: the attachment handshake succeeded, but the app lost its in-memory Collab view. Fully close and reopen the current IPA, return to **Sessions**, and check for the card labeled **OMP Collab**. If it repeatedly disappears, this is an app state issue rather than a Tailscale or bridge issue.
- A selected folder is rejected: restart the bridge with `--root "C:\"` or another root that contains the folder.
- **Use server default** fails: restart the bridge and ensure the first `--root` path exists.

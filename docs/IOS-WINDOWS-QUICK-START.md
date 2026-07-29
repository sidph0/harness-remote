# iPhone + Windows 11 Quick Start

The Mac is needed only to create and sign the IPA. After the app is installed, the Windows 11 computer runs the OMP bridge and the iPhone connects directly to it.

## 1. Build and install the IPA on a Mac

Requirements: macOS, Xcode, Node.js 22.12+, an Apple signing team, and a sideloader of your choice.

From a fresh repository checkout:

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
4. Enable **Developer Mode** on the iPhone if iOS requests it.
5. Load the IPA with a sideloader of your choice.
6. Trust the developer profile on the iPhone if prompted: **Settings > General > VPN & Device Management**.

For later builds, skip `npm run cap:add:ios`:

```bash
cd web
npm run build
npm run cap:sync:ios
open ios/App/App.xcodeproj
```

## 2. Prepare Windows 11

Install or verify:

- Node.js 22.12+
- Oh My Pi, with `omp` available in PowerShell
- Git, if cloning the repository on Windows

Verify OMP:

```powershell
omp --version
```

Clone the repository and choose a directory that the phone may use for sessions. Example: `C:\Users\YourName\Software`.

Allow the bridge through the Windows firewall. Run PowerShell as Administrator:

```powershell
New-NetFirewallRule -DisplayName "Harness Remote Bridge" -Direction Inbound -Protocol TCP -LocalPort 4097 -Action Allow -Profile Private
```

Find the Windows LAN address:

```powershell
ipconfig
```

Use the computer's **IPv4 Address**, not `127.0.0.1`.

## 3. Start the bridge on Windows 11

Keep this PowerShell window open while using the app:

```powershell
Set-Location C:\path\to\harness-remote
$env:HARNESS_REMOTE_USERNAME = "omp"
$env:HARNESS_REMOTE_PASSWORD = "<bridge-password>"
node .\bridge\src\cli.js `
  --host 0.0.0.0 `
  --port 4097 `
  --root "$HOME\Software" `
  --cors capacitor://localhost
```

Replace the repository path, root path, and password. Do not close this window. The bridge must be running for the iPhone to connect.

Optional local health check:

```powershell
curl.exe --user omp http://127.0.0.1:4097/v1/health
```

Enter the bridge password when prompted. A healthy response contains `"backend":"omp"`.

## 4. Connect the iPhone app

Put the iPhone and Windows computer on the same Wi-Fi network.

In Harness Remote:

1. Open **Settings**.
2. OMP is already selected in the native iOS app.
3. Set **Host** to the Windows IPv4 address from `ipconfig`.
4. Set **Port** to `4097`.
5. Enter username `omp` and the bridge password.
6. Tap **Test Connection**.
7. Select an allowed directory and create a session.
8. Send a prompt, confirm streaming, and test **Abort**.

## 5. Set up Tailscale for remote access

Tailscale creates a private network between the Windows host and iPhone. The friend's Mac is not needed for this step.

### Install Tailscale on Windows 11

1. Download Tailscale for Windows from [tailscale.com/download/windows](https://tailscale.com/download/windows).
2. Run the installer.
3. Open Tailscale from the Windows system tray.
4. Sign in with the account that will own the tailnet.
5. Confirm that Tailscale shows **Connected**.

In PowerShell, verify the Windows Tailscale address:

```powershell
tailscale status
tailscale ip -4
```

The address normally starts with `100.`. Keep it for the iPhone app.

### Install Tailscale on the iPhone

1. Install Tailscale from the [App Store](https://apps.apple.com/us/app/tailscale/id1470499037).
2. Open it and sign in with the same account used on Windows.
3. Allow the VPN configuration when iOS asks.
4. Confirm the iPhone appears in the same tailnet as the Windows computer.
5. Leave Tailscale connected while using Harness Remote.

### Allow the bridge through Windows Firewall

The existing Private profile rule may not cover the Tailscale adapter. Run PowerShell as Administrator and inspect the adapter:

```powershell
Get-NetAdapter | Where-Object Name -Like "*Tailscale*"
```

If the Tailscale adapter is blocked, allow TCP `4097` for the adapter shown by that command. The simplest rule is:

```powershell
New-NetFirewallRule -DisplayName "Harness Remote Tailscale Bridge" -Direction Inbound -Protocol TCP -LocalPort 4097 -Action Allow -Profile Any
```

Basic Auth still protects the bridge. Do not remove the bridge username and password.

### Connect through Tailscale

1. Start the bridge with `--host 0.0.0.0` as shown above.
2. Keep the bridge PowerShell window open.
3. Keep Tailscale connected on Windows and iPhone.
4. Open Harness Remote on the iPhone.
5. In **Settings**, set **Host** to the Windows Tailscale IPv4 address from `tailscale ip -4`.
6. Set **Port** to `4097`.
7. Enter username `omp` and the bridge password.
8. Tap **Test Connection**.

Do not enter `0.0.0.0` in the app. It is only the bridge's listening address. The app must use the specific Windows Tailscale address, usually a `100.x.x.x` address.

If the connection fails, first test the local bridge on Windows, then check Tailscale status on both devices, the Windows Firewall rule, and the Windows Tailscale IP.

## 6. Optional desktop Collab attachment

To attach the phone to a running desktop OMP session:

1. Run `/collab` in the desktop OMP session.
2. Copy the generated link.
3. In the iPhone app, choose **Attach OMP Collab**.
4. Enter a name and paste the link.
5. Use a writable link for prompts and aborts, or a room-key-only link for read-only viewing.

## If the phone cannot connect

Check these in order:

1. The bridge PowerShell window is still running.
2. The app uses the Windows IPv4 address, not `localhost` or `127.0.0.1`.
3. Windows and iPhone are on the same Wi-Fi, or both use the same Tailscale tailnet.
4. TCP port `4097` is allowed through the Windows Private firewall.
5. The username and password match the bridge environment variables.
6. The `--root` directory exists and contains the folders you want to use.

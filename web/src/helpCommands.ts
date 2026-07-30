import type { BackendKind } from "./types"

export type ConnectionHelpCommand = {
  platform: "macOS / Linux" | "Windows PowerShell"
  command: string
}

const COMMANDS: Record<BackendKind, readonly ConnectionHelpCommand[]> = {
  omp: [
    {
      platform: "macOS / Linux",
      command: `export HARNESS_REMOTE_USERNAME="omp"
export HARNESS_REMOTE_PASSWORD="<bridge-password>"
npx --yes ./bridge --backend omp --host 0.0.0.0 --port 4097 --root "$PWD" --cors capacitor://localhost`,
    },
    {
      platform: "Windows PowerShell",
      command: `Set-Location C:\\path\\to\\harness-remote
$env:HARNESS_REMOTE_USERNAME = "omp"
$env:HARNESS_REMOTE_PASSWORD = "<bridge-password>"
node .\\bridge\\src\\cli.js --host 0.0.0.0 --port 4097 --root "C:\\" --cors capacitor://localhost`,
    },
  ],
  pi: [
    {
      platform: "macOS / Linux",
      command: `export HARNESS_REMOTE_USERNAME="pi"
export HARNESS_REMOTE_PASSWORD="<bridge-password>"
export HARNESS_REMOTE_BACKEND="pi"
npx --yes ./bridge --backend pi --host 0.0.0.0 --port 4097 --root "$PWD" --cors capacitor://localhost`,
    },
    {
      platform: "Windows PowerShell",
      command: `Set-Location C:\\path\\to\\harness-remote
$env:HARNESS_REMOTE_USERNAME = "pi"
$env:HARNESS_REMOTE_PASSWORD = "<bridge-password>"
$env:HARNESS_REMOTE_BACKEND = "pi"
node .\\bridge\\src\\cli.js --backend pi --host 0.0.0.0 --port 4097 --root "C:\\" --cors capacitor://localhost`,
    },
  ],
  claude: [
    {
      platform: "macOS / Linux",
      command: `export HARNESS_REMOTE_USERNAME="claude"
export HARNESS_REMOTE_PASSWORD="<bridge-password>"
export HARNESS_REMOTE_BACKEND="claude"
npx --yes ./bridge --backend claude --host 0.0.0.0 --port 4097 --root "$PWD" --cors capacitor://localhost`,
    },
    {
      platform: "Windows PowerShell",
      command: `Set-Location C:\\path\\to\\harness-remote
$env:HARNESS_REMOTE_USERNAME = "claude"
$env:HARNESS_REMOTE_PASSWORD = "<bridge-password>"
$env:HARNESS_REMOTE_BACKEND = "claude"
node .\\bridge\\src\\cli.js --backend claude --host 0.0.0.0 --port 4097 --root "C:\\" --cors capacitor://localhost`,
    },
  ],
  opencode: [
    {
      platform: "macOS / Linux",
      command: `export OPENCODE_SERVER_USERNAME="opencode"
export OPENCODE_SERVER_PASSWORD="<server-password>"
npx -y opencode-ai serve --hostname 0.0.0.0 --port 4096`,
    },
    {
      platform: "Windows PowerShell",
      command: `$env:OPENCODE_SERVER_USERNAME = "opencode"
$env:OPENCODE_SERVER_PASSWORD = "<server-password>"
npx.cmd -y opencode-ai serve --hostname 0.0.0.0 --port 4096`,
    },
  ],
}

export function connectionHelpCommands(backend: BackendKind): readonly ConnectionHelpCommand[] {
  return COMMANDS[backend]
}

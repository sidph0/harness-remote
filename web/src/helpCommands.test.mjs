import assert from 'node:assert/strict'
import { connectionHelpCommands } from './helpCommands.ts'

const expected = {
  omp: [
    {
      platform: 'macOS / Linux',
      command: 'export HARNESS_REMOTE_USERNAME="omp"\nexport HARNESS_REMOTE_PASSWORD="<bridge-password>"\nnpx --yes ./bridge --backend omp --host 0.0.0.0 --port 4097 --root "$PWD" --cors capacitor://localhost',
    },
    {
      platform: 'Windows PowerShell',
      command: 'Set-Location C:\\path\\to\\harness-remote\n$env:HARNESS_REMOTE_USERNAME = "omp"\n$env:HARNESS_REMOTE_PASSWORD = "<bridge-password>"\nnode .\\bridge\\src\\cli.js --host 0.0.0.0 --port 4097 --root "C:\\" --cors capacitor://localhost',
    },
  ],
  pi: [
    {
      platform: 'macOS / Linux',
      command: 'export HARNESS_REMOTE_USERNAME="pi"\nexport HARNESS_REMOTE_PASSWORD="<bridge-password>"\nexport HARNESS_REMOTE_BACKEND="pi"\nnpx --yes ./bridge --backend pi --host 0.0.0.0 --port 4097 --root "$PWD" --cors capacitor://localhost',
    },
    {
      platform: 'Windows PowerShell',
      command: 'Set-Location C:\\path\\to\\harness-remote\n$env:HARNESS_REMOTE_USERNAME = "pi"\n$env:HARNESS_REMOTE_PASSWORD = "<bridge-password>"\n$env:HARNESS_REMOTE_BACKEND = "pi"\nnode .\\bridge\\src\\cli.js --backend pi --host 0.0.0.0 --port 4097 --root "C:\\" --cors capacitor://localhost',
    },
  ],
  claude: [
    {
      platform: 'macOS / Linux',
      command: 'export HARNESS_REMOTE_USERNAME="claude"\nexport HARNESS_REMOTE_PASSWORD="<bridge-password>"\nexport HARNESS_REMOTE_BACKEND="claude"\nnpx --yes ./bridge --backend claude --host 0.0.0.0 --port 4097 --root "$PWD" --cors capacitor://localhost',
    },
    {
      platform: 'Windows PowerShell',
      command: 'Set-Location C:\\path\\to\\harness-remote\n$env:HARNESS_REMOTE_USERNAME = "claude"\n$env:HARNESS_REMOTE_PASSWORD = "<bridge-password>"\n$env:HARNESS_REMOTE_BACKEND = "claude"\nnode .\\bridge\\src\\cli.js --backend claude --host 0.0.0.0 --port 4097 --root "C:\\" --cors capacitor://localhost',
    },
  ],
  opencode: [
    {
      platform: 'macOS / Linux',
      command: 'export OPENCODE_SERVER_USERNAME="opencode"\nexport OPENCODE_SERVER_PASSWORD="<server-password>"\nnpx -y opencode-ai serve --hostname 0.0.0.0 --port 4096',
    },
    {
      platform: 'Windows PowerShell',
      command: '$env:OPENCODE_SERVER_USERNAME = "opencode"\n$env:OPENCODE_SERVER_PASSWORD = "<server-password>"\nnpx.cmd -y opencode-ai serve --hostname 0.0.0.0 --port 4096',
    },
  ],
}

for (const backend of ['omp', 'pi', 'claude', 'opencode']) {
  const commands = connectionHelpCommands(backend)
  assert.equal(commands.length, 2)
  assert.deepEqual(commands, expected[backend])
  for (const { command } of commands) {
    assert.doesNotMatch(command, /--(?:username|password)\b/)
    assert.doesNotMatch(command, /https?:\/\/[^\s]*<[^>]+>/)
  }
}

console.log('help command behavior tests passed')

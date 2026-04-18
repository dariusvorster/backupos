export async function GET(req: Request): Promise<Response> {
  const origin = new URL(req.url).origin
  const script = `param(
    [string]$ServerUrl = "${origin}",
    [string]$EnrollmentToken = ""
)

if (-not $EnrollmentToken) {
    Write-Error "Usage: irm $ServerUrl/install.ps1 | iex  (or pass -EnrollmentToken TOKEN)"
    exit 1
}

Write-Host "Installing BackupOS agent for Windows..."

$AgentDir = "C:\\Program Files\\BackupOS"
$AgentPath = "$AgentDir\\backupos-agent.exe"
$ResticPath = "$AgentDir\\restic.exe"

New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null

# Download agent binary
$AgentUrl = "$ServerUrl/agent/backupos-agent-windows-x64.exe"
Write-Host "Downloading agent from $AgentUrl..."
Invoke-WebRequest -Uri $AgentUrl -OutFile $AgentPath -UseBasicParsing

# Download restic binary
$ResticZip = "$env:TEMP\\restic.zip"
$ResticUrl = "https://github.com/restic/restic/releases/latest/download/restic_windows_amd64.zip"
Write-Host "Downloading restic..."
Invoke-WebRequest -Uri $ResticUrl -OutFile $ResticZip -UseBasicParsing
Expand-Archive -Path $ResticZip -DestinationPath $AgentDir -Force

# Add agent dir to PATH for this session
$env:PATH = "$AgentDir;$env:PATH"

# Enroll agent
& $AgentPath enroll --url $ServerUrl --token $EnrollmentToken

# Install and start Windows service
& $AgentPath service install
& $AgentPath service start

Write-Host "BackupOS agent installed and running."
Write-Host "Node is now visible in the BackupOS dashboard."
`
  return new Response(script, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

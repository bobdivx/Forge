# Forge sur chemin UNC: CMD et certains outils npm refusent le cwd UNC.
# Ce script se place sur une lettre de lecteur qui pointe VERS CE DEPOT (package.json ageton),
# puis npm install (et optionnellement dev).
param(
    [switch]$RunDev
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Test-ForgeRepoRoot {
    param([string]$Path)
    $pkg = Join-Path $Path "package.json"
    if (-not (Test-Path -LiteralPath $pkg)) { return $false }
    return (Select-String -LiteralPath $pkg -Pattern '"name"\s*:\s*"ageton"' -Quiet)
}

function Set-LocationToForgeOnLetter {
    param([string]$Letter)
    $root = "${Letter}:\"
    if (-not (Test-Path -LiteralPath $root)) { return $false }
    if (-not (Test-ForgeRepoRoot -Path $root)) { return $false }
    Set-Location -LiteralPath $root
    return $true
}

function Use-FirstFreeDriveLetter {
    param([string]$UncPath)
    $letters = @("Z", "Y", "X", "W", "V", "U", "T", "S", "R")
    foreach ($L in $letters) {
        if (Set-LocationToForgeOnLetter -Letter $L) {
        Write-Host "Depot Forge trouve sur ${L}:\ (lecteur deja mappe)."
            return
        }
        $ps = Get-PSDrive -Name $L -ErrorAction SilentlyContinue
        $hasNet = Test-Path -LiteralPath "${L}:\"
        if ($ps -or $hasNet) { continue }

        New-PSDrive -Name $L -PSProvider FileSystem -Root $UncPath -Scope Global | Out-Null
        Set-Location -LiteralPath "${L}:\"
        if (-not (Test-ForgeRepoRoot -Path (Get-Location).Path)) {
            Remove-PSDrive -Name $L -Force -ErrorAction SilentlyContinue
            continue
        }
        Write-Host "UNC mappe sur ${L}:\"
        return
    }
    Write-Host ""
    Write-Host "Z: est souvent deja pris par un autre partage: npm voit Z:\ sans package.json." -ForegroundColor Yellow
    Write-Host "Verifie les connexions: net use" -ForegroundColor Yellow
    Write-Host "Puis soit : net use Z: /delete   puis   net use Z: `"$UncPath`"" -ForegroundColor Yellow
    Write-Host "Soit : net use Y: `"$UncPath`"   puis   cd Y:\" -ForegroundColor Yellow
    Write-Host ""
    throw "Impossible de mapper le depot sur une lettre libre (Z-R). Libere un lecteur ou corrige le mapping (voir ci-dessus)."
}

if ($repoRoot -match '^\\\\') {
    Write-Host "Depot en UNC: $repoRoot"
    Use-FirstFreeDriveLetter -UncPath $repoRoot
} else {
    Set-Location -LiteralPath $repoRoot
}

if (-not (Test-ForgeRepoRoot -Path (Get-Location).Path)) {
    throw "Ce dossier n est pas la racine Forge (package.json / name ageton introuvable): $(Get-Location)"
}

Write-Host "Répertoire: $(Get-Location)"
npm install --install-strategy=nested --no-fund --no-audit
if ($RunDev) {
    npm run dev
}

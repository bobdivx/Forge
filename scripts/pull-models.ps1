# scripts/pull-models.ps1
# Script pour installer les mod\u00e8les n\u00e9cessaires sur le gateway OpenClaw (NAS)

$GATEWAY_IP = "10.1.0.58"
$MODELS = @("qwen2.5:32b", "qwen2.5-coder:32b", "llama3.1:8b", "nomic-embed-text")

Write-Host "--- Installation des mod\u00e8les Ollama pour Forge ---" -ForegroundColor Cyan

foreach ($model in $MODELS) {
    Write-Host "Tentative d'installation de $model..." -ForegroundColor Yellow
    # On tente de passer par l'API Ollama du gateway si expos\u00e9e (port 11434 par d\u00e9faut sur ZimaOS)
    try {
        $body = @{ name = $model } | ConvertTo-Json
        Invoke-RestMethod -Uri "http://$($GATEWAY_IP):11434/api/pull" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
        Write-Host "Action initi\u00e9e pour $model sur le NAS." -ForegroundColor Green
    } catch {
        Write-Host "L'API Ollama (11434) n'est pas accessible directement sur l'IP du NAS." -ForegroundColor Red
        Write-Host "Veuillez ex\u00e9cuter manuellement sur le NAS : 'docker exec -it ollama ollama pull $model'" -ForegroundColor White
    }
}

Write-Host "`n--- Diagnostic final ---" -ForegroundColor Cyan
Write-Host "Consultez http://localhost:4322/health pour v\u00e9rifier la disponibilit\u00e9."

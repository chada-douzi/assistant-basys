# Test simple de la détection exhaustive (sans attendre la réponse LLM)
Write-Host "`nTest de détection exhaustive`n" -ForegroundColor Cyan

$questions = @(
    "Liste complète des équipements",
    "Quels sont les equipements documentes ?",
    "Donne-moi tous les équipements",
    "Quelle est la pression du compresseur EQ-003 ?"
)

foreach ($q in $questions) {
    Write-Host "Question: $q" -ForegroundColor Yellow
    
    # Lancer la requête en arrière-plan pour timeout rapide
    $job = Start-Job -ScriptBlock {
        param($question)
        try {
            $body = @{ question = $question } | ConvertTo-Json
            $result = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/chat' -Method POST -Body $body -ContentType 'application/json; charset=utf-8' -TimeoutSec 25
            return $result.sources.Count
        } catch {
            return -1
        }
    } -ArgumentList $q
    
    # Attendre max 30 secondes
    $completed = Wait-Job $job -Timeout 30
    
    if ($completed) {
        $count = Receive-Job $job
        if ($count -ge 0) {
            Write-Host "  Sources: $count" -ForegroundColor Green
        } else {
            Write-Host "  Erreur HTTP" -ForegroundColor Red
        }
    } else {
        Write-Host "  Timeout (LLM trop lent)" -ForegroundColor DarkGray
        Stop-Job $job
    }
    
    Remove-Job $job -Force
    Write-Host ""
}

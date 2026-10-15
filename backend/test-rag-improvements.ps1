# Script de test des améliorations RAG
# Usage: .\test-rag-improvements.ps1

Write-Host "`n========== TESTS DES AMÉLIORATIONS RAG ==========`n" -ForegroundColor Cyan

$baseUrl = "http://127.0.0.1:3000/api/chat"

$tests = @(
    @{
        name = "Test 1: Question sur EQ-003 (recherche par ID)"
        question = "Quelle est la pression actuelle du compresseur EQ-003 ?"
        expectedCategories = @("Équipements")
        expectedMinSources = 1
    },
    @{
        name = "Test 2: Liste des équipements"
        question = "Liste-moi tous les équipements documentés avec leurs identifiants."
        expectedCategories = @("Équipements")
        expectedMinSources = 3
    },
    @{
        name = "Test 3: Équipements sans accents"
        question = "Quels sont les equipements documentes ?"
        expectedCategories = @("Équipements")
        expectedMinSources = 3
    },
    @{
        name = "Test 4: Question multi-thèmes (équipements + maintenance)"
        question = "Quels équipements sont présents et quelles informations de maintenance sont disponibles ?"
        expectedCategories = @("Équipements", "Maintenance")
        expectedMinSources = 4
    },
    @{
        name = "Test 5: Question hors domaine"
        question = "Quelle est la recette traditionnelle du couscous tunisien ?"
        expectedCategories = @()
        expectedMinSources = 0
    }
)

foreach ($test in $tests) {
    Write-Host "$($test.name)" -ForegroundColor Yellow
    Write-Host "Question: $($test.question)" -ForegroundColor Gray
    
    $body = @{ question = $test.question } | ConvertTo-Json
    
    try {
        $result = Invoke-RestMethod -Uri $baseUrl -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
        
        $sourcesCount = $result.sources.Count
        $categories = $result.sources.category | Sort-Object -Unique
        
        Write-Host "  ✓ Sources: $sourcesCount" -ForegroundColor Green
        Write-Host "  ✓ Catégories: $($categories -join ', ')" -ForegroundColor Green
        
        if ($sourcesCount -lt $test.expectedMinSources) {
            Write-Host "  ⚠ ATTENTION: Attendu au moins $($test.expectedMinSources) sources" -ForegroundColor Yellow
        }
        
        Write-Host "  Documents:" -ForegroundColor Gray
        foreach ($source in $result.sources) {
            Write-Host "    - [$($source.category)] $($source.title)" -ForegroundColor DarkGray
        }
        
    } catch {
        Write-Host "  ✗ ERREUR: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Write-Host ""
}

Write-Host "`n========== TESTS TERMINÉS ==========`n" -ForegroundColor Cyan

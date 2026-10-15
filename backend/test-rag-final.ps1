# Script de test final du système RAG
# Usage: .\test-rag-final.ps1

Write-Host "`n========== AUDIT FINAL DU SYSTÈME RAG ==========`n" -ForegroundColor Cyan

$baseUrl = "http://127.0.0.1:3000/api/chat"

$tests = @(
    @{
        name = "Test 1: Recherche par ID (EQ-003)"
        question = "Quelle est la pression actuelle du compresseur EQ-003 ?"
        expectedMinSources = 1
        expectedMaxSources = 1
        mustContainCategories = @("Équipements")
        mustNotContainCategories = @("Maintenance", "Guide utilisateur", "FAQ")
    },
    @{
        name = "Test 2: Liste exhaustive TOUS les équipements"
        question = "Liste-moi tous les équipements documentés avec leurs identifiants."
        expectedMinSources = 8
        expectedMaxSources = 10
        mustContainCategories = @("Équipements")
        mustNotContainCategories = @("Maintenance")
        mustContainIdentifiers = @("EQ-001", "EQ-002", "EQ-003", "EQ-004", "EQ-005", "EQ-006", "EQ-007", "EQ-008")
    },
    @{
        name = "Test 3: Équipements sans accents"
        question = "Quels sont les equipements documentes ?"
        expectedMinSources = 5
        expectedMaxSources = 10
        mustContainCategories = @("Équipements")
    },
    @{
        name = "Test 4: Question multi-thèmes (équipements + maintenance)"
        question = "Quels équipements sont présents et quelles informations de maintenance sont disponibles ?"
        expectedMinSources = 4
        expectedMaxSources = 5
        mustContainCategories = @("Équipements", "Maintenance")
    },
    @{
        name = "Test 5: Question hors domaine"
        question = "Quelle est la recette traditionnelle du couscous tunisien ?"
        expectedMinSources = 0
        expectedMaxSources = 0
        mustContainCategories = @()
    },
    @{
        name = "Test 6: Liste complète avec mot-clé 'complet'"
        question = "Donne-moi la liste complète des équipements."
        expectedMinSources = 8
        expectedMaxSources = 10
        mustContainCategories = @("Équipements")
    }
)

$passed = 0
$failed = 0

foreach ($test in $tests) {
    Write-Host "$($test.name)" -ForegroundColor Yellow
    Write-Host "Question: $($test.question)" -ForegroundColor Gray
    
    $body = @{ question = $test.question } | ConvertTo-Json
    
    try {
        $result = Invoke-RestMethod -Uri $baseUrl -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
        
        $sourcesCount = $result.sources.Count
        $categories = $result.sources.category | Sort-Object -Unique
        $testPassed = $true
        
        Write-Host "  Sources: $sourcesCount" -ForegroundColor Cyan
        Write-Host "  Catégories: $($categories -join ', ')" -ForegroundColor Cyan
        
        # Vérification du nombre de sources
        if ($sourcesCount -lt $test.expectedMinSources) {
            Write-Host "  [ECHEC] Attendu au moins $($test.expectedMinSources) sources, reçu $sourcesCount" -ForegroundColor Red
            $testPassed = $false
        } elseif ($sourcesCount -gt $test.expectedMaxSources) {
            Write-Host "  [ECHEC] Attendu au plus $($test.expectedMaxSources) sources, reçu $sourcesCount" -ForegroundColor Red
            $testPassed = $false
        } else {
            Write-Host "  [OK] Nombre de sources: $sourcesCount (entre $($test.expectedMinSources) et $($test.expectedMaxSources))" -ForegroundColor Green
        }
        
        # Vérification des catégories requises
        foreach ($reqCat in $test.mustContainCategories) {
            # Normaliser pour comparaison insensible aux accents
            $normalizedReqCat = $reqCat.Normalize([Text.NormalizationForm]::FormD) -replace '\p{M}', ''
            $foundMatch = $false
            foreach ($cat in $categories) {
                $normalizedCat = $cat.Normalize([Text.NormalizationForm]::FormD) -replace '\p{M}', ''
                if ($normalizedCat -eq $normalizedReqCat) {
                    $foundMatch = $true
                    break
                }
            }
            if (-not $foundMatch) {
                Write-Host "  [ECHEC] Catégorie '$reqCat' manquante" -ForegroundColor Red
                $testPassed = $false
            } else {
                Write-Host "  [OK] Catégorie '$reqCat': présente" -ForegroundColor Green
            }
        }
        
        # Vérification des catégories interdites
        foreach ($forbiddenCat in $test.mustNotContainCategories) {
            # Normaliser pour comparaison insensible aux accents
            $normalizedForbiddenCat = $forbiddenCat.Normalize([Text.NormalizationForm]::FormD) -replace '\p{M}', ''
            $foundMatch = $false
            foreach ($cat in $categories) {
                $normalizedCat = $cat.Normalize([Text.NormalizationForm]::FormD) -replace '\p{M}', ''
                if ($normalizedCat -eq $normalizedForbiddenCat) {
                    $foundMatch = $true
                    break
                }
            }
            if ($foundMatch) {
                Write-Host "  [ECHEC] Catégorie '$forbiddenCat' ne devrait pas être présente" -ForegroundColor Red
                $testPassed = $false
            }
        }
        
        # Vérification des identifiants requis
        if ($test.mustContainIdentifiers) {
            $answer = $result.answer
            $missingIds = @()
            foreach ($id in $test.mustContainIdentifiers) {
                if ($answer -notmatch $id) {
                    $missingIds += $id
                }
            }
            if ($missingIds.Count -gt 0) {
                Write-Host "  [ECHEC] Identifiants manquants dans la réponse: $($missingIds -join ', ')" -ForegroundColor Red
                $testPassed = $false
            } else {
                Write-Host "  [OK] Tous les identifiants EQ-001 à EQ-008 présents" -ForegroundColor Green
            }
        }
        
        # Afficher les documents
        Write-Host "  Documents:" -ForegroundColor Gray
        foreach ($source in $result.sources) {
            Write-Host "    - [$($source.category)] $($source.title)" -ForegroundColor DarkGray
        }
        
        if ($testPassed) {
            Write-Host "  >>> TEST REUSSI <<<" -ForegroundColor Green
            $passed++
        } else {
            Write-Host "  >>> TEST ECHOUE <<<" -ForegroundColor Red
            $failed++
        }
        
    } catch {
        Write-Host "  [ERREUR] $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
    
    Write-Host ""
}

Write-Host "`n========== RÉSULTATS FINAUX ==========`n" -ForegroundColor Cyan
Write-Host "Tests réussis: $passed" -ForegroundColor Green
Write-Host "Tests échoués: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host ""

if ($failed -eq 0) {
    Write-Host ">>> TOUS LES TESTS SONT PASSES AVEC SUCCES <<<" -ForegroundColor Green
} else {
    Write-Host ">>> CERTAINS TESTS ONT ECHOUE <<<" -ForegroundColor Red
}
Write-Host ""

# Check local service status
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3001' -UseBasicParsing -TimeoutSec 5
    Write-Host "Local service: OK (HTTP $($r.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "Local service: DOWN" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Yellow
}

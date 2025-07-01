# PowerShell script to update package names from @org to @transport

Write-Host "Updating package names from @org/* to @transport/*..." -ForegroundColor Green

# Define files to update
$filesToUpdate = @(
    "packages/ui/package.json",
    "packages/utils/package.json", 
    "frontend/web/package.json",
    "frontend/web/app/page.tsx",
    "frontend/web/tsconfig.json",
    "frontend/web/next.config.js",
    "tsconfig.json"
)

# Update each file
foreach ($file in $filesToUpdate) {
    if (Test-Path $file) {
        Write-Host "Updating $file" -ForegroundColor Yellow
        $content = Get-Content $file -Raw
        $content = $content -replace '@org/', '@transport/'
        Set-Content $file $content
    } else {
        Write-Host "File not found: $file" -ForegroundColor Red
    }
}

# Update workspace root package.json if needed
if (Test-Path "package.json") {
    Write-Host "Updating root package.json" -ForegroundColor Yellow
    $content = Get-Content "package.json" -Raw
    # Update the name if it exists
    $content = $content -replace '"name": "org-', '"name": "transport-'
    Set-Content "package.json" $content
}

Write-Host "Package name updates complete!" -ForegroundColor Green
Write-Host "Now run 'yarn install' to install dependencies" -ForegroundColor Cyan
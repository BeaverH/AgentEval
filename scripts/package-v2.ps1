param(
  [string]$Image = 'ghcr.io/idddd/tali-ui-demo:0.2.24',
  [ValidatePattern('^[a-z0-9][a-z0-9-]{0,80}$')]
  [string]$ReleaseName = 'marketplace-v3-0-2-24-offline',
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseRoot = Join-Path $taskRoot ".artifacts/releases/$ReleaseName"
if (Test-Path -LiteralPath $releaseRoot) { throw 'Release directory already exists; preserve the previous package or choose a new release path.' }
if (-not $SkipBuild) {
  & docker build --platform linux/amd64 -f (Join-Path $taskRoot 'deploy/Dockerfile.marketplace') --build-arg TALI_UI_DEMO_IMAGE_TAG=0.2.24 -t $Image $taskRoot
  if ($LASTEXITCODE -ne 0) { throw 'V2 image build failed.' }
  & node (Join-Path $taskRoot 'scripts/uat/verify-ui-isolation.mjs') $Image (Join-Path $taskRoot '.artifacts/mock-isolation-runtime.json')
  if ($LASTEXITCODE -ne 0) { throw 'Image isolation verification failed.' }
}
$imageId = & docker image inspect $Image --format '{{.Id}}'
if ($LASTEXITCODE -ne 0) { throw 'V2 image is missing.' }
$platform = & docker image inspect $Image --format '{{.Os}}/{{.Architecture}}'
if ($LASTEXITCODE -ne 0 -or $platform -ne 'linux/amd64') { throw 'Offline release requires a Linux amd64 image.' }
$evidence = Get-Content -LiteralPath (Join-Path $taskRoot '.artifacts/mock-isolation-runtime.json') -Raw | ConvertFrom-Json
if ($evidence.imageId -ne $imageId -or $evidence.cases.Count -lt 16 -or @($evidence.cases | Where-Object { $_.uiHealth -ne 200 -or $_.errorStatus -ne 503 }).Count -gt 0) { throw 'Passing isolation evidence does not match the image being packaged.' }
New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $taskRoot 'deploy/helm/tali-ui-demo') -Destination (Join-Path $releaseRoot 'helm') -Recurse
Copy-Item -LiteralPath (Join-Path $taskRoot 'deploy/values.uat.example.yaml') -Destination (Join-Path $releaseRoot 'values.uat.yaml')
Copy-Item -LiteralPath (Join-Path $taskRoot 'deploy/v2/UAT-token-config.md') -Destination (Join-Path $releaseRoot 'UAT-token-config.md')
Copy-Item -LiteralPath (Join-Path $taskRoot 'docs/integration-api.md') -Destination (Join-Path $releaseRoot 'integration-api.md')
Copy-Item -LiteralPath (Join-Path $taskRoot 'docs/uat/2026-10-29-v3-three-input-fallback.md') -Destination (Join-Path $releaseRoot 'three-input-configuration.md')
Copy-Item -LiteralPath (Join-Path $taskRoot 'deploy/v2/accounts.example.json') -Destination (Join-Path $releaseRoot 'accounts.json')
Copy-Item -LiteralPath (Join-Path $taskRoot 'docs/uat/v2-refresh-and-nemo-create.md') -Destination (Join-Path $releaseRoot 'nemo-create-analysis.md')
Copy-Item -LiteralPath (Join-Path $taskRoot 'docs/uat/v2-creation-integration-differences.md') -Destination (Join-Path $releaseRoot 'creation-integration-differences.md')
Copy-Item -LiteralPath (Join-Path $taskRoot 'docs/uat/v2-page-alignment.md') -Destination (Join-Path $releaseRoot 'page-alignment.md')
Copy-Item -LiteralPath (Join-Path $taskRoot 'docs/uat/2026-10-28-v3-deployment-diagnostics.md') -Destination (Join-Path $releaseRoot 'deployment-diagnostics.md')
Copy-Item -LiteralPath (Join-Path $taskRoot 'docs/uat/2026-11-03-v0.2.24-release-validation.md') -Destination (Join-Path $releaseRoot 'mock-isolation-validation.md')
Copy-Item -LiteralPath (Join-Path $taskRoot 'docs/uat/2026-10-28-tech-measure-metrics.md') -Destination (Join-Path $releaseRoot 'current-ui-metrics.md')
Copy-Item -LiteralPath (Join-Path $taskRoot 'scripts/uat/verify-ui-isolation.mjs') -Destination (Join-Path $releaseRoot 'verify-ui-isolation.mjs')
Copy-Item -LiteralPath (Join-Path $taskRoot '.artifacts/mock-isolation-runtime.json') -Destination (Join-Path $releaseRoot 'isolation-test-results.json')
foreach ($name in @('README.md','database.env.example','marketplace.env.example','nemo.env.example','f5.env.example','check-nemo.mjs')) {
  Copy-Item -LiteralPath (Join-Path $taskRoot "deploy/v2/$name") -Destination (Join-Path $releaseRoot $name)
}
$sourceRef = & git -C $taskRoot rev-parse HEAD
$dirty = @(& git -C $taskRoot status --porcelain).Count -gt 0
$manifest = @{ image = $Image; imageId = $imageId; platform = $platform; sourceBase = $sourceRef; sourceIncludesWorkingTreeChanges = $dirty; uiHealthEndpoint = '/api/health'; realDiagnosticsEndpoint = '/api/nmgr/ready'; isolationEvidence = 'isolation-test-results.json'; nemoVerifiedCommit = '9a1971b81b38e2848641289cf7ce51aab544be28'; f5Validation = 'documented-contract-tests-only; target-instance acceptance required'; builtAt = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $releaseRoot 'manifest.json'), $manifest, [Text.UTF8Encoding]::new($false))
& docker save --output (Join-Path $releaseRoot 'marketplace-v2.tar') $Image
if ($LASTEXITCODE -ne 0) { throw 'Image export failed.' }
$checks = Get-ChildItem -LiteralPath $releaseRoot -File -Recurse | Sort-Object FullName | ForEach-Object {
  $relative = $_.FullName.Substring($releaseRoot.Length + 1).Replace('\','/')
  (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $relative
}
[IO.File]::WriteAllText((Join-Path $releaseRoot 'SHA256SUMS'), ($checks -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
$zip = $releaseRoot + '.zip'
Compress-Archive -LiteralPath $releaseRoot -DestinationPath $zip -CompressionLevel Optimal
Write-Output "Offline release: $zip"
$zipHash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(($zip + '.sha256'), "$zipHash  $ReleaseName.zip`n", [Text.UTF8Encoding]::new($false))
Write-Output ('SHA256: ' + $zipHash)

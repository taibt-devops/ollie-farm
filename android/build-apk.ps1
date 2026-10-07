# Build Ollie's Farm APK (release, signed with the same key as Word Island) -> ..\dist\OllieFarm-<version>.apk
#   .\build-apk.ps1              build
#   .\build-apk.ps1 -Install     build + cai len may tinh bang dang cam USB (can bat USB debugging)
param([switch]$Install)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
Set-Content -Path local.properties -Value ("sdk.dir=" + ($sdk -replace '\\', '\\')) -Encoding ascii

# Release key: tao 1 lan, GIU LAI (mat key = khong cai de ban moi len duoc, phai go app => mat tien do)
if (-not (Test-Path keystore.properties)) {
    $pw = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    New-Item -ItemType Directory -Force keystore | Out-Null
    & "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -keystore keystore\wordisland-release.jks -alias wordisland `
        -keyalg RSA -keysize 2048 -validity 36500 -storepass $pw -keypass $pw -dname 'CN=Word Island, C=VN'
    if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }
    Set-Content -Path keystore.properties -Encoding ascii -Value @(
        'storeFile=keystore/wordisland-release.jks', "storePassword=$pw", 'keyAlias=wordisland', "keyPassword=$pw")
    Write-Host 'Da tao keystore moi: android\keystore\ + android\keystore.properties - hay sao luu 2 file nay.' -ForegroundColor Yellow
}

& .\gradlew.bat assembleRelease
if ($LASTEXITCODE -ne 0) { throw 'gradle build failed' }

$version = (Select-String -Path app\build.gradle -Pattern "versionName '([^']+)'").Matches[0].Groups[1].Value
New-Item -ItemType Directory -Force ..\dist | Out-Null
$out = Join-Path (Resolve-Path ..\dist) "OllieFarm-$version.apk"
Copy-Item app\build\outputs\apk\release\app-release.apk $out -Force
Write-Host "APK: $out ($([math]::Round((Get-Item $out).Length / 1MB, 1)) MB)" -ForegroundColor Green

if ($Install) {
    & (Join-Path $sdk 'platform-tools\adb.exe') install -r $out
}

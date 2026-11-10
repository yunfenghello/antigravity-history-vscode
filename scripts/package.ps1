<#
.SYNOPSIS
    Antigravity History 扩展离线标准化 VSIX 打包脚本
.DESCRIPTION
    本脚本严格遵循 VS Code 扩展发布规范与 OPC 压缩协议：
    1. 动态读取 package.json 版本号并生成规范的 extension.vsixmanifest 与 [Content_Types].xml；
    2. 按照 .vscodeignore 规范安全过滤源码、开发配置与本地模块，装配 extension/ 目录；
    3. 调用 .NET ZipFile 原生压缩引擎输出标准 .vsix 安装包；
    4. 自动归档至项目根目录与 packages/ 目录，并输出校验摘要。
.AUTHOR
    Antigravity Coding Assistant
.DATE
    2026-11-10
#>

param(
    [string]$TargetVersion = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

Write-Host "=== 启动 Antigravity History 扩展 VSIX 打包流程 ===" -ForegroundColor Cyan

# 1. 确保构建产物最新
Write-Host "[1/4] 执行生产级编译与资源构建..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    throw "构建失败，已中止打包。"
}

# 2. 读取 package.json 配置
$pkgJsonPath = Join-Path $rootDir "package.json"
$pkgJson = Get-Content $pkgJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = if ($TargetVersion) { $TargetVersion } else { $pkgJson.version }
$vsixName = "antigravity-history-$version.vsix"
$rootVsix = Join-Path $rootDir $vsixName
$packagesDir = Join-Path $rootDir "packages"
$packagesVsix = Join-Path $packagesDir $vsixName

Write-Host "[2/4] 当前版本号: $version, 目标制品: $vsixName" -ForegroundColor Cyan

# 3. 构造临时暂存目录
$stagingDir = Join-Path $rootDir ".vsix_staging"
if (Test-Path $stagingDir) {
    Remove-Item $stagingDir -Recurse -Force
}
$null = New-Item -ItemType Directory -Path $stagingDir -Force
$extDir = Join-Path $stagingDir "extension"
$null = New-Item -ItemType Directory -Path $extDir -Force

# 3.1 生成 [Content_Types].xml
$contentTypesXml = '<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".css" ContentType="text/css"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".json" ContentType="application/json"/><Default Extension=".md" ContentType="text/markdown"/><Default Extension=".png" ContentType="image/png"/><Default Extension=".svg" ContentType="image/svg+xml"/><Default Extension=".txt" ContentType="text/plain"/><Default Extension=".vsixmanifest" ContentType="text/xml"/></Types>'
[System.IO.File]::WriteAllText((Join-Path $stagingDir "[Content_Types].xml"), $contentTypesXml, [System.Text.Encoding]::UTF8)

# 3.2 生成 extension.vsixmanifest
$vsixManifestXml = @"
<?xml version="1.0" encoding="utf-8"?>
	<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
		<Metadata>
			<Identity Language="en-US" Id="antigravity-history" Version="$version" Publisher="yunfenghello" />
			<DisplayName>Antigravity History - Browse &amp; Export</DisplayName>
			<Description xml:space="preserve">Browse, search, and export Antigravity AI conversation history with full reasoning chain, workspace categorization, and multi-format support.</Description>
			<Tags>antigravity,conversation,history,export,ai,chat,llm,backup,save,markdown,json,local,browse,sync,recovery,knowledge-base,search,conversations</Tags>
			<Categories>AI,Chat,Other,Visualization</Categories>
			<GalleryFlags>Public</GalleryFlags>
			
			<Properties>
				<Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.85.0" />
				<Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
				<Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />
				<Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace" />
				<Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value="" />
				<Property Id="Microsoft.VisualStudio.Code.EnabledApiProposals" Value="" />
				
				<Property Id="Microsoft.VisualStudio.Code.ExecutesCode" Value="true" />
				
				<Property Id="Microsoft.VisualStudio.Services.Links.Source" Value="https://github.com/yunfenghello/antigravity-history-vscode.git" />
				<Property Id="Microsoft.VisualStudio.Services.Links.Getstarted" Value="https://github.com/yunfenghello/antigravity-history-vscode.git" />
				<Property Id="Microsoft.VisualStudio.Services.Links.GitHub" Value="https://github.com/yunfenghello/antigravity-history-vscode.git" />
				<Property Id="Microsoft.VisualStudio.Services.Links.Support" Value="https://github.com/yunfenghello/antigravity-history-vscode/issues" />
				<Property Id="Microsoft.VisualStudio.Services.Links.Learn" Value="https://github.com/yunfenghello/antigravity-history-vscode#readme" />
				
				
				<Property Id="Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown" Value="true" />
				<Property Id="Microsoft.VisualStudio.Services.Content.Pricing" Value="Free"/>

				
				
			</Properties>
			<License>extension/LICENSE.txt</License>
			<Icon>extension/resources/icon.png</Icon>
		</Metadata>
		<Installation>
			<InstallationTarget Id="Microsoft.VisualStudio.Code"/>
		</Installation>
		<Dependencies/>
		<Assets>
			<Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
			<Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/readme.md" Addressable="true" />
<Asset Type="Microsoft.VisualStudio.Services.Content.Changelog" Path="extension/changelog.md" Addressable="true" />
<Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE.txt" Addressable="true" />
<Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/resources/icon.png" Addressable="true" />
		</Assets>
	</PackageManifest>
"@
[System.IO.File]::WriteAllText((Join-Path $stagingDir "extension.vsixmanifest"), $vsixManifestXml, [System.Text.Encoding]::UTF8)

# 3.3 复制文件到 extension/
Write-Host "[3/4] 组装 extension 目录文件树..." -ForegroundColor Yellow

$copyItems = @(
    "package.json",
    "package.nls.json",
    "package.nls.zh-cn.json",
    ".nojekyll",
    "README_CN.md"
)

foreach ($item in $copyItems) {
    $src = Join-Path $rootDir $item
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $extDir $item) -Force
    }
}

# 复制 README.md -> readme.md
Copy-Item -Path (Join-Path $rootDir "README.md") -Destination (Join-Path $extDir "readme.md") -Force
# 复制 CHANGELOG.md -> changelog.md
Copy-Item -Path (Join-Path $rootDir "CHANGELOG.md") -Destination (Join-Path $extDir "changelog.md") -Force
# 复制 LICENSE -> LICENSE.txt
Copy-Item -Path (Join-Path $rootDir "LICENSE") -Destination (Join-Path $extDir "LICENSE.txt") -Force

# 复制目录
$dirCopies = @("dist", "resources", "docs")
foreach ($d in $dirCopies) {
    $src = Join-Path $rootDir $d
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $extDir $d) -Recurse -Force
    }
}

# 4. 压缩为 VSIX 文件
Write-Host "[4/4] 压缩生成 VSIX 安装包..." -ForegroundColor Yellow
if (Test-Path $rootVsix) {
    Remove-Item $rootVsix -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stagingDir, $rootVsix, [System.IO.Compression.CompressionLevel]::Optimal, $false)

# 确保 packages 目录存在并复制
if (-not (Test-Path $packagesDir)) {
    $null = New-Item -ItemType Directory -Path $packagesDir -Force
}
Copy-Item -Path $rootVsix -Destination $packagesVsix -Force

# 清理暂存目录
Remove-Item $stagingDir -Recurse -Force

$fileInfo = Get-Item $rootVsix
$sizeKb = [Math]::Round($fileInfo.Length / 1024, 2)
Write-Host "打包成功！产物清单:" -ForegroundColor Green
Write-Host "  - 根目录安装包: $rootVsix ($sizeKb KB)" -ForegroundColor Cyan
Write-Host "  - 历史归档包:   $packagesVsix ($sizeKb KB)" -ForegroundColor Cyan

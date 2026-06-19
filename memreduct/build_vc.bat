@echo off
cd /d "%~dp0"

set "vcvarsall="
set "vsPath="

rem 1) Use vswhere (official VS locator, ships with VS 2017+)
set "vswhere=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if exist "%vswhere%" (
    for /f "usebackq delims=" %%i in (`"%vswhere%" -latest -requires Microsoft.Component.MSBuild -property installationPath`) do set "vsPath=%%i"
    if defined vsPath (
        if exist "%vsPath%\VC\Auxiliary\Build\vcvarsall.bat" (
            set "vcvarsall=%vsPath%\VC\Auxiliary\Build\vcvarsall.bat"
        )
    )
)

rem 2) Fallback: scan known VS paths
if not defined vcvarsall (
    for %%v in (18 17) do for %%e in (Community Professional Enterprise) do (
        if exist "%ProgramFiles%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" set "vcvarsall=%ProgramFiles%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat"
        if defined vcvarsall goto found
        if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" set "vcvarsall=%ProgramFiles(x86)%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat"
        if defined vcvarsall goto found
    )
)

:found
if not defined vcvarsall (
    echo [ERROR] Visual Studio not found. Install VS with "Desktop development with C++" workload.
    pause
    exit /b 1
)

call "%vcvarsall%" amd64
if errorlevel 1 (
    echo [ERROR] vcvarsall failed
    pause
    exit /b 1
)

msbuild memreduct.vcxproj -property:Configuration=Release -property:Platform=x64 -verbosity:normal
if errorlevel 1 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)
echo [OK] bin\64\memreduct-viewstage.exe
pause

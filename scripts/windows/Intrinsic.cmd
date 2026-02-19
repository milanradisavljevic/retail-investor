@echo off
setlocal EnableExtensions

set "DISTRO=Debian"
set "LAUNCH=~/dev/retail-investor/scripts/windows/launch_agent.sh"

where wt.exe >nul 2>nul
if errorlevel 1 (
  wsl.exe -d %DISTRO% -e bash -lc "%LAUNCH% codex"
  exit /b %errorlevel%
)

wt.exe -w 0 ^
  new-tab --title "Codex" --tabColor "#3B82F6" wsl.exe -d %DISTRO% -e bash -lc "%LAUNCH% codex" ; ^
  new-tab --title "Claude" --tabColor "#F59E0B" wsl.exe -d %DISTRO% -e bash -lc "%LAUNCH% claude" ; ^
  new-tab --title "Opencode" --tabColor "#8B5CF6" wsl.exe -d %DISTRO% -e bash -lc "%LAUNCH% opencode" ; ^
  new-tab --title "Qwen" --tabColor "#22C55E" wsl.exe -d %DISTRO% -e bash -lc "%LAUNCH% qwen" ; ^
  new-tab --title "Kimi" --tabColor "#7DD3FC" wsl.exe -d %DISTRO% -e bash -lc "%LAUNCH% kimi" ; ^
  new-tab --title "Gemini" --tabColor "#14B8A6" wsl.exe -d %DISTRO% -e bash -lc "%LAUNCH% gemini"

endlocal

@echo off
setlocal

cd /d "%~dp0"

echo.
echo Starting AI Roundtable development server...
echo Project directory: %cd%
echo.

if not exist package.json (
  echo package.json was not found in this folder.
  echo Please move this script back to the AI Roundtable project root.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo node_modules was not found.
  echo Please run npm install once before starting the dev server.
  echo.
  pause
  exit /b 1
)

echo Local URL: http://localhost:3000
echo Press Ctrl+C in this window to stop the server.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "$url='http://localhost:3000'; for ($i=0; $i -lt 40; $i++) { try { $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1; if ($response.StatusCode -ge 200) { Start-Process $url; break } } catch { Start-Sleep -Milliseconds 500 } }"

call npm run dev

echo.
echo AI Roundtable development server stopped.
pause

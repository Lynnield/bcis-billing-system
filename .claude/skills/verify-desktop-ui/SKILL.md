---
name: verify-desktop-ui
description: Launch the BCIS Electron desktop app and screenshot a real window to visually verify a UI change, on Windows, without Playwright installed.
---

# Verify desktop UI changes live

Automated E2E lives in `desktop/e2e` (`npm run e2e`). For ad-hoc visual checks, use this
procedure to actually look at a screen after changing it, instead of trusting
typecheck/tests alone for anything visual.

## Prerequisites

- The API must already be running (`cd api && npm run dev`, port 3000) against
  `bcis_billing` (dev DB) — check with `curl -s http://localhost:3000/health`.
- Close any stray `electron.exe` processes first: `tasklist //FI "IMAGENAME eq electron.exe"`
  and `taskkill //PID <pid> //T //F` for each. Electron's dev-mode child process does
  **not** reliably die from `TaskStop` on a background Bash task alone on Windows — it
  must be force-killed by PID/tree afterward, or you end up screenshotting a stale
  orphaned window instead of your fresh one.

## Before clicking anything

`SetForegroundWindow` can report success while another visible window (pgAdmin,
VS Code, etc.) silently keeps the actual input focus and absorbs every click —
the screenshot still *shows* the BCIS window because it's topmost in z-order at
that moment, but clicks land on the real foreground window instead and nothing
happens. If a click produces no visible effect after retrying, minimize other
open GUI windows first:

```powershell
Get-Process | Where-Object { $_.MainWindowTitle -like "*pgAdmin*" } | ForEach-Object {
  [Win32X]::ShowWindow($_.MainWindowHandle, 6) | Out-Null  # SW_MINIMIZE
}
```

Then `ShowWindow($hwnd, 9)` (SW_RESTORE) + `SetForegroundWindow($hwnd)` on the
BCIS window before clicking.

## Launch

```bash
cd /c/xampp/htdocs/bcis-billing-system/desktop && npm run dev 2>&1
```
Run via Bash with `run_in_background: true`. Wait ~5-8s, then find the window:

```powershell
Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "BCIS Billing" } | Select-Object Id, MainWindowTitle, StartTime
```

If more than one row comes back, trust the one whose `StartTime` matches your launch —
not whichever PID you remember from an earlier session.

## Screenshot + click (self-contained PowerShell, every time)

PowerShell tool calls do **not** persist `Add-Type` definitions between separate
invocations — each script must redefine its Win32 types from scratch. Also: this app's
window is **not** DPI-aware by default, so `GetWindowRect`/`SetCursorPos` from an
unaware PowerShell process land at the wrong scaled coordinates. Call
`SetProcessDpiAwarenessContext([IntPtr](-4))` once at the top of the script before
anything else, so the rect you get back and the pixels you click are in the same
(physical) coordinate space as the screenshot you save.

```powershell
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32X {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr value);
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
}
"@
Add-Type -AssemblyName System.Drawing
[Win32X]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null

$proc = Get-Process -Id <PID>
$hwnd = $proc.MainWindowHandle
[Win32X]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 400
$rect = New-Object Win32X+RECT
[Win32X]::GetWindowRect($hwnd, [ref]$rect) | Out-Null

# click at a target (rect.Left/.Top + an offset you measured from a prior screenshot)
[Win32X]::SetCursorPos($rect.Left + <x>, $rect.Top + <y>) | Out-Null
Start-Sleep -Milliseconds 150
[Win32X]::mouse_event([Win32X]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 80
[Win32X]::mouse_event([Win32X]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 1200

$w = $rect.Right - $rect.Left; $h = $rect.Bottom - $rect.Top
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $w, $h))
$bmp.Save("<scratchpad>\shot.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
```

Then `Read` the saved PNG — don't trust the click worked without looking.

## Cleanup

Kill the electron process tree explicitly when done:
```bash
taskkill //PID <pid> //T //F
```
Leave any pre-existing API process on port 3000 alone unless you started it yourself.

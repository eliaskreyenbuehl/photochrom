# USB microscope: capture a single frame at full quality

Integration guide for Claude Code. Goal: capture a single frame from the USB microscope **uncompressed at 2592×1944**, save it as PNG, and also produce a smaller preview that Claude Code can view and analyse.

---

## 1. Setup (verified)

| Item | Value |
|---|---|
| Operating system | Windows 11, PowerShell |
| Device | UVC camera, no driver needed, device name **`Digital microscope`** |
| Other cameras on the system | `Integrated Camera`, `Integrated IR Camera` (do not use) |
| Access | ffmpeg via DirectShow (`-f dshow`), address the device **by name**, not by index |
| Tested ffmpeg version | 9.0.2 (gyan.dev full build) |

### Supported modes (excerpt from `ffmpeg -list_options`)

| Format | Resolution | fps | Use |
|---|---|---|---|
| `yuyv422` (uncompressed) | **2592×1944** | 2 | **Default for single frames** |
| `yuyv422` | 2048×1536 | 3 | |
| `yuyv422` | 1920×1080 | 3 | |
| `yuyv422` | 1280×1024 | 5 | |
| `mjpeg` | 2592×1944 | 25 | Preview/video, JPEG artefacts |
| `mjpeg` | 1920×1080 | 25 | |

Why `yuyv422`: the format is uncompressed and has no JPEG artefacts, which matters for fine structures. The low frame rate does not matter for single frames.

---

## 2. Core command

```powershell
ffmpeg -hide_banner -loglevel error -y `
  -f dshow -video_size 2592x1944 -pixel_format yuyv422 -i video="Digital microscope" `
  -ss 2 -frames:v 1 capture_full.png `
  -ss 2 -vf scale=1296:-1 -frames:v 1 capture_preview.png
```

- `-ss 2` comes **before each output** and discards the first 2 seconds so exposure and white balance can settle. Without it the image is often too dark or has a colour cast.
- One call writes **two files**: the full frame for archiving and a half-size preview (1296×972) for Claude Code to look at.
- The full frame as PNG is about 8–12 MB.

---

## 3. PowerShell script `capture.ps1`

Creates timestamped files and prints **one JSON line** with the paths at the end, so other programs can process them.

```powershell
<#
.SYNOPSIS
  Captures an uncompressed single frame from the USB microscope (2592x1944, yuyv422).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\capture.ps1
  powershell -ExecutionPolicy Bypass -File .\capture.ps1 -OutDir D:\scans -WarmupSeconds 3 -NoPreview
#>
param(
    [string]$OutDir        = ".\captures",
    [string]$Device        = "Digital microscope",
    [string]$Size          = "2592x1944",
    [double]$WarmupSeconds = 2,
    [int]   $PreviewWidth  = 1296,
    [switch]$NoPreview
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    throw "ffmpeg not found. Install: winget install ffmpeg (then reopen the terminal)."
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$ts      = Get-Date -Format "yyyyMMdd_HHmmss_fff"
$full    = Join-Path $OutDir "${ts}_full.png"
$preview = Join-Path $OutDir "${ts}_preview.png"
$warm    = $WarmupSeconds.ToString([System.Globalization.CultureInfo]::InvariantCulture)

$ffArgs = @(
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "dshow", "-video_size", $Size, "-pixel_format", "yuyv422",
    "-i", "video=$Device",
    "-ss", $warm, "-frames:v", "1", $full
)
if (-not $NoPreview) {
    $ffArgs += @("-ss", $warm, "-vf", "scale=${PreviewWidth}:-1", "-frames:v", "1", $preview)
}

& ffmpeg @ffArgs
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $full)) {
    throw "Capture failed (ffmpeg exit $LASTEXITCODE). Is the device in use by another app?"
}

[pscustomobject]@{
    full      = (Resolve-Path $full).Path
    preview   = if ($NoPreview) { $null } else { (Resolve-Path $preview).Path }
    device    = $Device
    size      = $Size
    format    = "yuyv422"
    timestamp = $ts
} | ConvertTo-Json -Compress
```

Note: `$args` is an automatic variable in PowerShell, which is why the list is called `$ffArgs`.

---

## 4. Python module `microscope.py` (for integration into the project)

Standard library only; ffmpeg must be on the `PATH`.

```python
"""USB microscope: uncompressed single frame via ffmpeg/DirectShow (Windows)."""
from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

DEVICE = "Digital microscope"
FULL_SIZE = "2592x1944"
PIXEL_FORMAT = "yuyv422"


class CaptureError(RuntimeError):
    pass


@dataclass
class Capture:
    full: Path
    preview: Path | None
    timestamp: str


def capture(
    out_dir: str | Path = "captures",
    device: str = DEVICE,
    size: str = FULL_SIZE,
    warmup_s: float = 2.0,
    preview_width: int | None = 1296,
    timeout_s: float = 30.0,
) -> Capture:
    """Capture a single frame. Returns paths to the full frame and (optionally) the preview."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise CaptureError("ffmpeg not on PATH (winget install ffmpeg).")

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
    full = out / f"{ts}_full.png"
    preview = out / f"{ts}_preview.png" if preview_width else None

    cmd = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-f", "dshow", "-video_size", size, "-pixel_format", PIXEL_FORMAT,
        "-i", f"video={device}",
        "-ss", str(warmup_s), "-frames:v", "1", str(full),
    ]
    if preview is not None:
        cmd += ["-ss", str(warmup_s), "-vf", f"scale={preview_width}:-1",
                "-frames:v", "1", str(preview)]

    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
    except subprocess.TimeoutExpired as e:
        raise CaptureError(f"Timeout after {timeout_s}s – device blocked?") from e

    if r.returncode != 0 or not full.exists():
        raise CaptureError(
            f"ffmpeg exit {r.returncode}: {r.stderr.strip() or 'no output'}"
        )
    return Capture(full=full, preview=preview, timestamp=ts)


if __name__ == "__main__":
    c = capture()
    print(c.full)
    if c.preview:
        print(c.preview)
```

Usage:

```python
from microscope import capture, CaptureError

try:
    shot = capture(out_dir="data/captures")
    # shot.full    -> archive / further processing
    # shot.preview -> for Claude Code to look at
except CaptureError as e:
    print("Capture failed:", e)
```

---

## 5. Rules for Claude Code

1. **Run natively on Windows**, not in WSL. WSL does not see the USB device without `usbipd`.
2. **Always address the device by name** (`video=Digital microscope`), never by index. Index 0 is the built-in laptop camera.
3. **To look at a capture, always open the preview** (`*_preview.png`) with the Read tool, not the full frame. The full frame would be downscaled on reading anyway.
4. **Never overwrite or modify the full frame.** Make a copy for image processing (cropping, contrast, etc.).
5. Before capturing, make sure no other app (Photos, Camera, Teams, browser) has the device open.
6. If the lighting is poor (too dark or colour cast), first raise `warmup_s` to 3–4 before looking for other causes.

---

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Could not run graph` / `I/O error` / timeout | Device in use by another app → close Photos/Camera app, Teams, browser tabs |
| `Could not find video device with name [Digital microscope]` | Microscope not plugged in or different name → `ffmpeg -hide_banner -list_devices true -f dshow -i dummy` |
| Black image | Windows privacy: turn on *Settings → Privacy & security → Camera → Let desktop apps access your camera* |
| Image too dark / colour cast | Warm-up too short → increase `-ss` / `warmup_s` |
| `Could not set video options` | Resolution/format combination not supported → check the table in section 1 |
| `ffmpeg` not found | `winget install ffmpeg`, then reopen the terminal |
| Script blocked (ExecutionPolicy) | `powershell -ExecutionPolicy Bypass -File .\capture.ps1` |

### Diagnostic commands

```powershell
# List devices
ffmpeg -hide_banner -list_devices true -f dshow -i dummy

# Supported modes of the microscope (always ends with "Error opening input" – that is normal)
ffmpeg -hide_banner -f dshow -list_options true -i video="Digital microscope"

# Device in Windows
Get-PnpDevice -Class Camera -PresentOnly
```

---

## 7. Optional: fast mode (MJPEG)

For series of captures, or when speed matters more than avoiding artefacts:

```powershell
ffmpeg -hide_banner -loglevel error -y -f dshow -vcodec mjpeg -video_size 2592x1944 `
  -i video="Digital microscope" -ss 1 -frames:v 1 capture.jpg
```

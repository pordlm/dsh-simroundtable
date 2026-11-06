# Capture N frames of the primary display as fast as CopyFromScreen allows.
param([int]$Count = 24, [int]$IntervalMs = 0, [string]$Out = "preview\_cap")
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
if (-not (Test-Path $Out)) { New-Item -ItemType Directory -Path $Out | Out-Null }
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$sw = [Diagnostics.Stopwatch]::StartNew()
for ($i = 0; $i -lt $Count; $i++) {
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
  $g.Dispose()
  $path = Join-Path $Out ("frame{0:d2}.png" -f $i)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  "{0} t={1}ms" -f $path, $sw.ElapsedMilliseconds
  if ($IntervalMs -gt 0) { Start-Sleep -Milliseconds $IntervalMs }
}

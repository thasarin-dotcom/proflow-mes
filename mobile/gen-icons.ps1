Add-Type -AssemblyName System.Drawing

$logoPath = "C:\Thanpao\Wise\MESDev\ProFlow_Supabase\wisenovation_LOGO -Cut.png"
$logo = [System.Drawing.Image]::FromFile($logoPath)
$starRect = New-Object System.Drawing.Rectangle(1850, 60, 380, 400)

function New-Icon([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::Transparent)

  $r = [int]($size * 0.22)
  $white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
  $path2 = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path2.AddArc(0, 0, $d, $d, 180, 90)
  $path2.AddArc($size - $d, 0, $d, $d, 270, 90)
  $path2.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
  $path2.AddArc(0, $size - $d, $d, $d, 90, 90)
  $path2.CloseFigure()
  $brush = New-Object System.Drawing.SolidBrush($white)
  $g.FillPath($brush, $path2)

  $starSize = [int]($size * 0.62)
  $off = [int](($size - $starSize) / 2)
  $destRect = New-Object System.Drawing.Rectangle($off, $off, $starSize, $starSize)
  $g.DrawImage($logo, $destRect, $starRect, [System.Drawing.GraphicsUnit]::Pixel)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

$dir = Join-Path $PSScriptRoot "icons"
New-Icon -size 192 -path (Join-Path $dir "icon-192.png")
New-Icon -size 512 -path (Join-Path $dir "icon-512.png")
$logo.Dispose()
Write-Output "done"

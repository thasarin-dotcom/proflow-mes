Add-Type -AssemblyName System.Drawing

function New-Icon([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $r = [int]($size * 0.22)
  $blue = [System.Drawing.Color]::FromArgb(255, 0x1e, 0x3a, 0x8a)
  $lightBlue = [System.Drawing.Color]::FromArgb(255, 0x60, 0xa5, 0xfa)
  $white = [System.Drawing.Color]::White

  $path2 = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path2.AddArc(0, 0, $d, $d, 180, 90)
  $path2.AddArc($size - $d, 0, $d, $d, 270, 90)
  $path2.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
  $path2.AddArc(0, $size - $d, $d, $d, 90, 90)
  $path2.CloseFigure()
  $brush = New-Object System.Drawing.SolidBrush($blue)
  $g.FillPath($brush, $path2)

  $cx = $size * 0.775
  $cy = $size * 0.235
  $s = $size * 0.095
  $starPts = @(
    [System.Drawing.PointF]::new($cx, $cy - $s),
    [System.Drawing.PointF]::new($cx + $s*0.28, $cy - $s*0.28),
    [System.Drawing.PointF]::new($cx + $s, $cy),
    [System.Drawing.PointF]::new($cx + $s*0.28, $cy + $s*0.28),
    [System.Drawing.PointF]::new($cx, $cy + $s),
    [System.Drawing.PointF]::new($cx - $s*0.28, $cy + $s*0.28),
    [System.Drawing.PointF]::new($cx - $s, $cy),
    [System.Drawing.PointF]::new($cx - $s*0.28, $cy - $s*0.28)
  )
  $starBrush = New-Object System.Drawing.SolidBrush($lightBlue)
  $g.FillPolygon($starBrush, $starPts)

  $fontSize = [single]($size * 0.5)
  $font = New-Object System.Drawing.Font -ArgumentList @("Arial", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $whiteBrush = New-Object System.Drawing.SolidBrush($white)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rectY = [single]($size * 0.06)
  $rect = New-Object System.Drawing.RectangleF -ArgumentList @([single]0, $rectY, [single]$size, [single]$size)
  $g.DrawString("P", $font, $whiteBrush, $rect, $sf)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

$dir = Join-Path $PSScriptRoot "icons"
New-Icon -size 192 -path (Join-Path $dir "icon-192.png")
New-Icon -size 512 -path (Join-Path $dir "icon-512.png")
Write-Output "done"

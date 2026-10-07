Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\Y.DROUICHE\Documents\Default Project\client\public\logo.jpeg"
$dstPath = "C:\Users\Y.DROUICHE\Documents\Default Project\client\public\logo.png"

$src = [System.Drawing.Image]::FromFile($srcPath)
$bmp = New-Object System.Drawing.Bitmap $src
$src.Dispose()

$w = $bmp.Width
$h = $bmp.Height
$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bytes = New-Object byte[] ($data.Stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)

$alphas = New-Object byte[] ($w * $h)
$transp = 0
$soft = 0

for ($y = 0; $y -lt $h; $y++) {
    $rowOff = $y * $data.Stride
    for ($x = 0; $x -lt $w; $x++) {
        $i = $rowOff + $x * 4
        $b = $bytes[$i]
        $g = $bytes[$i + 1]
        $r = $bytes[$i + 2]

        $mn = $r; if ($g -lt $mn) { $mn = $g }; if ($b -lt $mn) { $mn = $b }
        $mx = $r; if ($g -gt $mx) { $mx = $g }; if ($b -gt $mx) { $mx = $b }
        $sat = if ($mx -gt 0) { ($mx - $mn) / [double]$mx } else { 0 }

        $alpha = 255
        if ($sat -lt 0.15 -and $mn -ge 120) { $alpha = 0 }
        elseif ($sat -lt 0.45 -and $mn -ge 175) { $alpha = [int](255 * ($sat - 0.15) / 0.30) }

        $alphas[$y * $w + $x] = [byte]$alpha
        $bytes[$i + 3] = [byte]$alpha
        if ($alpha -eq 0) { $transp++ } elseif ($alpha -lt 255) { $soft++ }
    }
}

[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
$bmp.UnlockBits($data)
$bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$total = $w * $h
Write-Output ("Dimensions      : {0}x{1}" -f $w, $h)
Write-Output ("Transparent     : {0} px ({1}%)" -f $transp, [math]::Round(100 * $transp / $total, 1))
Write-Output ("Bords adoucis   : {0} px ({1}%)" -f $soft, [math]::Round(100 * $soft / $total, 1))
Write-Output ("Opaque          : {0} px ({1}%)" -f ($total - $transp - $soft), [math]::Round(100 * ($total - $transp - $soft) / $total, 1))
Write-Output ""
Write-Output "=== Carte de l'opacite (espace = transparent, # = visible) ==="
$cols = 96
$rows = 26
$out = New-Object System.Text.StringBuilder
for ($ry = 0; $ry -lt $rows; $ry++) {
    $y = [int](($ry + 0.5) * $h / $rows)
    for ($rx = 0; $rx -lt $cols; $rx++) {
        $x = [int](($rx + 0.5) * $w / $cols)
        $a = $alphas[$y * $w + $x]
        $ch = if ($a -lt 40) { ' ' } elseif ($a -lt 140) { '.' } elseif ($a -lt 250) { '+' } else { '#' }
        [void]$out.Append($ch)
    }
    [void]$out.AppendLine()
}
Write-Output $out.ToString()
Write-Output "Saved: $dstPath"

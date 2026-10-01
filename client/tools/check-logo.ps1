Add-Type -AssemblyName System.Drawing

$p = "C:\Users\Y.DROUICHE\Documents\Default Project\client\public\logo.png"
$img = [System.Drawing.Image]::FromFile($p)
$bmp = New-Object System.Drawing.Bitmap $img
$img.Dispose()

$w = $bmp.Width
$h = $bmp.Height
$rSum = 0; $gSum = 0; $bSum = 0; $n = 0
$dominant = @{}
$redPx = 0

for ($y = 0; $y -lt $h; $y += 2) {
    for ($x = 0; $x -lt $w; $x += 2) {
        $c = $bmp.GetPixel($x, $y)
        if ($c.A -lt 200) { continue }
        $n++
        $rSum += $c.R; $gSum += $c.G; $bSum += $c.B
        if ($c.R -gt ($c.G + 40) -and $c.R -gt ($c.B + 40)) { $redPx++ }
        $k = "$([int]($c.R / 32) * 32),$([int]($c.G / 32) * 32),$([int]($c.B / 32) * 32)"
        if ($dominant.ContainsKey($k)) { $dominant[$k]++ } else { $dominant[$k] = 1 }
    }
}

Write-Output ("Pixels opaques analyses : {0}" -f $n)
Write-Output ("Couleur moyenne        : R{0} G{1} B{2}" -f [int]($rSum / $n), [int]($gSum / $n), [int]($bSum / $n))
Write-Output ("Pixels a dominante rouge : {0} ({1}%)" -f $redPx, [math]::Round(100 * $redPx / $n, 1))
Write-Output ""
Write-Output "=== Couleurs dominantes des pixels conserves (par palier de 32) ==="
$dominant.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 8 | ForEach-Object {
    Write-Output ("  {0}  ->  {1}" -f $_.Key, $_.Value)
}
$bmp.Dispose()

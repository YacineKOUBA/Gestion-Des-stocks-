Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\Y.DROUICHE\Documents\Default Project\client\public\logo.jpeg"
$src = [System.Drawing.Image]::FromFile($srcPath)
$bmp = New-Object System.Drawing.Bitmap $src
$src.Dispose()

$w = $bmp.Width
$h = $bmp.Height

function Show($label, $x, $y) {
    $c = $bmp.GetPixel($x, $y)
    Write-Output ("{0} ({1},{2}) = R{3} G{4} B{5}" -f $label, $x, $y, $c.R, $c.G, $c.B)
}

Write-Output "=== Coins ==="
Show "haut-gauche    " 0 0
Show "haut-droit     " ($w - 1) 0
Show "bas-gauche     " 0 ($h - 1)
Show "bas-droit      " ($w - 1) ($h - 1)

Write-Output "=== Bords (milieu) ==="
Show "haut   centre  " ([int]($w / 2)) 0
Show "bas    centre  " ([int]($w / 2)) ($h - 1)
Show "gauche centre  " 0 ([int]($h / 2))
Show "droite centre  " ($w - 1) ([int]($h / 2))

Write-Output "=== Couleur dominante (echantillon 1 px sur 3) ==="
$counts = @{}
for ($y = 0; $y -lt $h; $y += 3) {
    for ($x = 0; $x -lt $w; $x += 3) {
        $c = $bmp.GetPixel($x, $y)
        $k = "$($c.R),$($c.G),$($c.B)"
        if ($counts.ContainsKey($k)) { $counts[$k]++ } else { $counts[$k] = 1 }
    }
}
$counts.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 8 | ForEach-Object {
    Write-Output ("  {0}  ->  {1} px" -f $_.Key, $_.Value)
}

$bmp.Dispose()

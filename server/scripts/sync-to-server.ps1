<#
.SYNOPSIS
  Synchronise la base locale `gdtrading` vers un serveur distant via SSH.

.DESCRIPTION
  Sequence : pg_dump local -> scp -> pg_restore sur le serveur -> verification.
  PostgreSQL tourne SUR LE SERVEUR (pas de port 5432 expose) : la restauration
  s'execute donc en ssh, en local sur lui.

  Authentification par cle SSH (~/.ssh/id_ed25519, sans passphrase) : la mise en
  place de la cle sur le serveur est un passage unique (voir docs).

.EXEMPLE
  .\sync-to-server.ps1 -Server 51.15.20.30 -User deploy -InitRemote
  .\sync-to-server.ps1 -Server 51.15.20.30 -User deploy -VerifyOnly
#>
param(
  [Parameter(Mandatory = $true)][string]$Server,      # IP ou nom du VPS
  [Parameter(Mandatory = $true)][string]$User,        # utilisateur SSH
  [string]$DbName = 'gdtrading',
  [string]$DbUser = 'gdtrading',
  [string]$PgBin = 'C:\Program Files\PostgreSQL\16\bin',
  [string]$DumpPath = "$env:USERPROFILE\Documents\gdtrading_sync.dump",
  [string]$RemoteDump = '/tmp/gdtrading_sync.dump',
  # Premier passage : cree le role, la base et les droits (execute en sudo sur le serveur).
  [switch]$InitRemote,
  # Ne fait que controler la base distante (apres une synchro, par exemple).
  [switch]$VerifyOnly
)
$ErrorActionPreference = 'Stop'
$target = "$User@$Server"

function Invoke-Ssh([string]$Command) {
  # BatchMode : echec net si la cle n'est pas en place, jamais de blocage sur un prompt.
  $out = ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new $target $Command 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "SSH échoue ($LASTEXITCODE) sur '$Command' :`n$($out -join "`n")"
  }
  return ($out -join "`n").Trim()
}

Write-Host "== 0. Test de la connexion SSH ($target)" -ForegroundColor Cyan
$ok = Invoke-Ssh 'echo SSH_OK'
if ($ok -notmatch 'SSH_OK') { throw "Réponse SSH inattendue : $ok" }
Write-Host "   OK : cle fonctionnelle" -ForegroundColor Green

if (-not $VerifyOnly) {
  Write-Host "== 1. pg_dump local ($DbName)" -ForegroundColor Cyan
  if (Test-Path $DumpPath) { Remove-Item $DumpPath -Force }
  & "$PgBin\pg_dump.exe" -h localhost -U $DbUser -d $DbName -Fc -f $DumpPath
  if ($LASTEXITCODE -ne 0) { throw "pg_dump a échoué ($LASTEXITCODE)" }
  $size = [math]::Round((Get-Item $DumpPath).Length / 1MB, 2)
  Write-Host "   OK : $DumpPath ($size Mo)" -ForegroundColor Green

  Write-Host "== 2. Transfert scp -> ${Server}:$RemoteDump" -ForegroundColor Cyan
  scp -o BatchMode=yes $DumpPath "${target}:$RemoteDump"
  if ($LASTEXITCODE -ne 0) { throw "scp a échoué ($LASTEXITCODE)" }
  Write-Host "   OK" -ForegroundColor Green
}

if ($InitRemote) {
  Write-Host "== 3. Création du rôle / de la base / des droits (sur le serveur)" -ForegroundColor Cyan
  # sudo sans mot de passe requis pour l'utilisateur SSH (a configurer une fois).
  $init = @"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DbUser'" | grep -q 1 || sudo -u postgres psql -c "CREATE ROLE $DbUser LOGIN PASSWORD 'CHANGE_ME'";
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'" | grep -q 1 || sudo -u postgres createdb -O $DbUser $DbName;
sudo -u postgres psql -d $DbName -c 'GRANT USAGE, CREATE ON SCHEMA public TO $DbUser;'
"@
  Write-Host (Invoke-Ssh $init)
  Write-Host "   ATTENTION : mot de passe du rôle '$DbUser' à définir (CHANGE_ME ci-dessus), ou pré-créé." -ForegroundColor Yellow
}

if (-not $VerifyOnly) {
  Write-Host "== 4. pg_restore sur le serveur (base cible)" -ForegroundColor Cyan
  # --clean --if-exists : repasse sur une base deja alimentee ; --no-owner : les
  # objets appartiennent au role de la base cible quel que soit l'identite locale.
  $restore = "pg_restore -h localhost -U $DbUser -d $DbName --clean --if-exists --no-owner $RemoteDump 2>&1 | tail -5; echo RESTORE_EXIT=`$?"
  Write-Host (Invoke-Ssh $restore)
}

Write-Host "== 5. Vérifications sur $Server/$DbName" -ForegroundColor Cyan
$checks = @(
  @('articles',        "SELECT count(*) FROM articles"),
  @('utilisateurs',    "SELECT count(*) FROM users"),
  @('migrations',      "SELECT count(*) FROM _prisma_migrations"),
  @('familles',        "SELECT count(*) FROM families"),
  @('journal audit',   "SELECT count(*) FROM audit_log"),
  @('dernière migration', "SELECT migration_name FROM _prisma_migrations ORDER BY started_at DESC LIMIT 1")
)
foreach ($c in $checks) {
  $v = Invoke-Ssh "psql -h localhost -U $DbUser -d $DbName -tAc `"$($c[1])`" 2>/dev/null || echo INDISPONIBLE"
  Write-Host ("   {0,-22} : {1}" -f $c[0], $v)
}
Write-Host "`nTerminé. Vérifier ensuite : /api/health sur le serveur." -ForegroundColor Cyan

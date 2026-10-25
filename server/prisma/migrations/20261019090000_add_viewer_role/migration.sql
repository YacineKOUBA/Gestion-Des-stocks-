-- AlterEnum
-- D29 : nouveau profil VIEWER (« Consultant »), lecture seule sur toutes les pages
-- sauf Inventaire, Referentiel, Utilisateurs, Parametres et Journal d'audit.
ALTER TYPE "RoleCode" ADD VALUE 'VIEWER';

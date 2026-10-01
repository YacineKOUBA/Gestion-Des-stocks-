import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui';
import type { Permission } from '../types';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  /** Droit necessaire pour voir ET ouvrir l'ecran. Le serveur le revérifie. */
  permission: Permission;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Tableau de bord', end: true, permission: 'dashboard:read' },
  { to: '/stock', label: 'État de stock', permission: 'stock:read' },
  { to: '/articles', label: 'Article', permission: 'article:read' },
  { to: '/mouvements', label: 'Mouvement', permission: 'movement:read' },
  { to: '/lots', label: 'Lots & péremptions', permission: 'lot:read' },
  { to: '/inventaires', label: 'Inventaire', permission: 'inventory:read' },
  { to: '/prets', label: 'Prêt / Emprunt', permission: 'loan:read' },
  { to: '/reservations', label: 'Réservation', permission: 'reservation:read' },
  { to: '/bons', label: 'Document', permission: 'bon:read' },
  { to: '/valorisation', label: 'Valorisation', permission: 'valuation:read' },
  { to: '/referentiels', label: 'Référentiel', permission: 'referential:manage' },
  { to: '/utilisateurs', label: 'Utilisateurs', permission: 'user:read' },
  { to: '/parametres', label: 'Paramètres', permission: 'settings:read' },
  { to: '/audit', label: "Journal d'audit", permission: 'audit:read' },
];

export function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="centered">
        <Spinner />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/**
 * Premier ecran que le profil a le droit d'ouvrir, dans l'ordre du menu.
 * Renvoie null si le profil n'a le droit de rien voir.
 *
 * D19 : necessaire parce qu'un profil peut ne pas avoir `dashboard:read`. La
 * page d'accueil '/' exige precisement ce droit : rediriger en dur vers '/'
 * faisait boucler ce profil entre la garde et la page refusee.
 */
export function firstAllowedPath(can: (permission: Permission) => boolean): string | null {
  return NAV_ITEMS.find((item) => can(item.permission))?.to ?? null;
}

function Forbidden() {
  return (
    <div className="centered">
      <div className="card">
        <h1>Accès refusé</h1>
        <p className="muted">
          Votre profil ne donne accès à aucun écran. Contactez l'administrateur si vous pensez qu'il
          s'agit d'une erreur.
        </p>
      </div>
    </div>
  );
}

/**
 * Garde de route par droit (D16). Remplace `RequireAdmin`, qui ne pouvait
 * distinguer que deux profils. Le message est volontairement sobre : le menu
 * ne propose deja pas l'ecran, on n'est ici que face a une URL saisie a la main.
 */
export function RequirePermission({ permission }: { permission: Permission }) {
  const { can } = useAuth();
  if (!can(permission)) {
    const repli = firstAllowedPath(can);
    return repli ? <Navigate to={repli} replace /> : <Forbidden />;
  }
  return <Outlet />;
}

export function Layout() {
  const { user, can, signOut } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    signOut();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">GD</span>
          <span className="brand-text">
            GD Trading
            <small>Gestion des stocks</small>
          </span>
        </div>
        <nav>
          {NAV_ITEMS.filter((item) => can(item.permission)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-user">
            <span className="user-name">{user?.displayName ?? user?.login}</span>
            <span className="badge badge-neutral">{user?.roleLabel}</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            Déconnexion
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  admin?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Tableau de bord', end: true },
  { to: '/stock', label: 'État de stock' },
  { to: '/articles', label: 'Article' },
  { to: '/mouvements', label: 'Mouvement' },
  { to: '/lots', label: 'Lots & péremptions' },
  { to: '/inventaires', label: 'Inventaire' },
  { to: '/prets', label: 'Prêt / Emprunt' },
  { to: '/reservations', label: 'Réservation' },
  { to: '/bons', label: 'Document' },
  { to: '/valorisation', label: 'Valorisation', admin: true },
  { to: '/referentiels', label: 'Référentiel', admin: true },
  { to: '/utilisateurs', label: 'Utilisateurs', admin: true },
  { to: '/parametres', label: 'Paramètres', admin: true },
  { to: '/audit', label: "Journal d'audit", admin: true },
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

export function RequireAdmin() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function Layout() {
  const { user, isAdmin, signOut } = useAuth();
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
          {NAV_ITEMS.filter((item) => !item.admin || isAdmin).map((item) => (
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
            <span className={`badge badge-${isAdmin ? 'info' : 'neutral'}`}>{user?.role}</span>
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

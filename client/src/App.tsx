import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout, RequireAuth, RequirePermission } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { StockPage } from './pages/StockPage';
import { ArticlesPage } from './pages/ArticlesPage';
import { MovementsPage } from './pages/MovementsPage';
import { LotsPage } from './pages/LotsPage';
import { InventoriesPage } from './pages/InventoriesPage';
import { InventoryDetailPage } from './pages/InventoryDetailPage';
import { LoansPage } from './pages/LoansPage';
import { ReservationPage } from './pages/ReservationPage';
import { BonsPage } from './pages/BonsPage';
import { ValuationPage } from './pages/ValuationPage';
import { ReferentialPage } from './pages/ReferentialPage';
import { SettingsPage } from './pages/SettingsPage';
import { UsersPage } from './pages/UsersPage';
import { AuditPage } from './pages/AuditPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              {/* Chaque ecran porte le droit qui conditionne son acces. La garde
                  cliente n'est qu'un confort : le serveur revérifie sur chaque route. */}
              <Route element={<RequirePermission permission="dashboard:read" />}>
                <Route index element={<DashboardPage />} />
              </Route>
              <Route element={<RequirePermission permission="stock:read" />}>
                <Route path="stock" element={<StockPage />} />
              </Route>
              <Route element={<RequirePermission permission="article:read" />}>
                <Route path="articles" element={<ArticlesPage />} />
              </Route>
              <Route element={<RequirePermission permission="movement:read" />}>
                <Route path="mouvements" element={<MovementsPage />} />
              </Route>
              <Route element={<RequirePermission permission="lot:read" />}>
                <Route path="lots" element={<LotsPage />} />
              </Route>
              <Route element={<RequirePermission permission="inventory:read" />}>
                <Route path="inventaires" element={<InventoriesPage />} />
                <Route path="inventaires/:id" element={<InventoryDetailPage />} />
              </Route>
              <Route element={<RequirePermission permission="loan:read" />}>
                <Route path="prets" element={<LoansPage />} />
              </Route>
              <Route element={<RequirePermission permission="reservation:read" />}>
                <Route path="reservations" element={<ReservationPage />} />
              </Route>
              <Route element={<RequirePermission permission="bon:read" />}>
                <Route path="bons" element={<BonsPage />} />
              </Route>
              <Route element={<RequirePermission permission="valuation:read" />}>
                <Route path="valorisation" element={<ValuationPage />} />
              </Route>
              <Route element={<RequirePermission permission="referential:manage" />}>
                <Route path="referentiels" element={<ReferentialPage />} />
              </Route>
              <Route element={<RequirePermission permission="user:read" />}>
                <Route path="utilisateurs" element={<UsersPage />} />
              </Route>
              <Route element={<RequirePermission permission="settings:read" />}>
                <Route path="parametres" element={<SettingsPage />} />
              </Route>
              <Route element={<RequirePermission permission="audit:read" />}>
                <Route path="audit" element={<AuditPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

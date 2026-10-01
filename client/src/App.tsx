import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout, RequireAdmin, RequireAuth } from './components/Layout';
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
              <Route index element={<DashboardPage />} />
              <Route path="stock" element={<StockPage />} />
              <Route path="articles" element={<ArticlesPage />} />
              <Route path="mouvements" element={<MovementsPage />} />
              <Route path="lots" element={<LotsPage />} />
              <Route path="inventaires" element={<InventoriesPage />} />
              <Route path="inventaires/:id" element={<InventoryDetailPage />} />
              <Route path="prets" element={<LoansPage />} />
              <Route path="reservations" element={<ReservationPage />} />
              <Route path="bons" element={<BonsPage />} />
              <Route element={<RequireAdmin />}>
                <Route path="valorisation" element={<ValuationPage />} />
                <Route path="referentiels" element={<ReferentialPage />} />
                <Route path="utilisateurs" element={<UsersPage />} />
                <Route path="parametres" element={<SettingsPage />} />
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

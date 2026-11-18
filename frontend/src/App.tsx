import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ReservaLayout } from './components/layout/ReservaLayout';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { SpacesPage } from './pages/spaces/SpacesPage';
import { AvailabilityPage } from './pages/availability/AvailabilityPage';
import { ReservationsPage } from './pages/reservations/ReservationsPage';
import { UsersPage } from './pages/users/UsersPage';
import { ResponsibilitiesPage } from './pages/users/ResponsibilitiesPage';
import { RegistrationPage } from './pages/registration/RegistrationPage';
import { SecurityPage } from './pages/security/SecurityPage';
import { useAuth } from './context/AuthContext';
import { canViewResponsibilitiesPage, canViewUsersPage } from './lib/permissions';

function PermissionRoute({ allow, children }: { allow: (user: ReturnType<typeof useAuth>['usuario']) => boolean; children: ReactNode }) {
  const { usuario, loading } = useAuth();
  if (loading) return null;
  return allow(usuario) ? children : <Navigate to="/" replace />;
}

function App() {

  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <BrowserRouter>
           {/* Último recurso: evita una pantalla en blanco si falla el layout o una ruta. */}
            <ErrorBoundary>
              <Routes>
                <Route path="/registro" element={<RegistrationPage />} />
                <Route path="/" element={<ReservaLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="espacios" element={<SpacesPage />} />
                  <Route path="disponibilidad" element={<AvailabilityPage />} />
                  <Route path="reservas" element={<ReservationsPage />} />
                  <Route path="timonel/reservas" element={<ReservationsPage timonelModule />} />
                  <Route path="historial" element={<Navigate to="/" replace />} />
                  <Route path="usuarios" element={<PermissionRoute allow={canViewUsersPage}><UsersPage /></PermissionRoute>} />
                  <Route path="responsables" element={<PermissionRoute allow={canViewResponsibilitiesPage}><ResponsibilitiesPage /></PermissionRoute>} />
                  <Route path="seguridad" element={<SecurityPage />} />
                  <Route path="reportes" element={<Navigate to="/" replace />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </BrowserRouter>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App

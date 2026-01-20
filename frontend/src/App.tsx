import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import RegisterPage from './pages/RegisterPage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import WorkflowCreatePage from './pages/WorkflowCreatePage';
import ProfilePage from './pages/ProfilePage';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/AdminUsers';
import AdminAuditLog from './pages/AdminAuditLog';
import InstancesPage from './pages/InstancesPage';
import WorkflowHistoryPage from './pages/WorkflowHistoryPage';
import WorkflowDetailPage from './pages/WorkflowDetailPage';
import NotFoundPage from './pages/NotFoundPage';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import PageTransition from './components/PageTransition';
import SkipLink from './components/SkipLink';

function AppRoutes() {
  return (
    <>
      <SkipLink />
      <PageTransition>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workflow/create"
          element={
            <ProtectedRoute>
              <WorkflowCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/instances"
          element={
            <ProtectedRoute>
              <InstancesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workflow/history"
          element={
            <ProtectedRoute>
              <WorkflowHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workflow/:id"
          element={
            <ProtectedRoute>
              <WorkflowDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminRoute>
              <AdminUsers />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/audit-log"
          element={
            <AdminRoute>
              <AdminAuditLog />
            </AdminRoute>
          }
        />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </PageTransition>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

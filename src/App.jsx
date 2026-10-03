import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAuth, RedirectIfAuthenticated, NotFound } from '@/components/layout/Guards'
import AccountPage from '@/pages/app/AccountPage'
import ActivityPage from '@/pages/app/ActivityPage'
import CompanyPage from '@/pages/app/CompanyPage'
import CustomersPage from '@/pages/app/CustomersPage'
import DashboardPage from '@/pages/app/DashboardPage'
import FleetPage from '@/pages/app/FleetPage'
import MembersPage from '@/pages/app/MembersPage'
import PaymentsPage from '@/pages/app/PaymentsPage'
import RentalDetailPage from '@/pages/app/RentalDetailPage'
import RentalFormPage from '@/pages/app/RentalFormPage'
import RentalsPage from '@/pages/app/RentalsPage'
import ReportsPage from '@/pages/app/ReportsPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import LoginPage from '@/pages/auth/LoginPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import SetupPage from '@/pages/auth/SetupPage'

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route
        path="/setup"
        element={
          <RedirectIfAuthenticated>
            <SetupPage />
          </RedirectIfAuthenticated>
        }
      />

      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        }
      />

      <Route
        path="/forgot-password"
        element={
          <RedirectIfAuthenticated>
            <ForgotPasswordPage />
          </RedirectIfAuthenticated>
        }
      />

      <Route
        path="/reset-password"
        element={
          <RedirectIfAuthenticated>
            <ResetPasswordPage />
          </RedirectIfAuthenticated>
        }
      />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="rentals" element={<RentalsPage />} />
        <Route path="rentals/new" element={<RentalFormPage />} />
        <Route path="rentals/:id" element={<RentalDetailPage />} />
        <Route path="rentals/:id/edit" element={<RentalFormPage />} />
        <Route path="fleet" element={<FleetPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="company" element={<CompanyPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
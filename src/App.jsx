import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAuth, RedirectIfAuthenticated, NotFound } from '@/components/layout/Guards'
const AccountPage = lazy(() => import('@/pages/app/AccountPage'))
const ActivityPage = lazy(() => import('@/pages/app/ActivityPage'))
const CompanyPage = lazy(() => import('@/pages/app/CompanyPage'))
const CustomersPage = lazy(() => import('@/pages/app/CustomersPage'))
const DashboardPage = lazy(() => import('@/pages/app/DashboardPage'))
const FleetPage = lazy(() => import('@/pages/app/FleetPage'))
const MembersPage = lazy(() => import('@/pages/app/MembersPage'))
const PaymentsPage = lazy(() => import('@/pages/app/PaymentsPage'))
const RentalDetailPage = lazy(() => import('@/pages/app/RentalDetailPage'))
const RentalFormPage = lazy(() => import('@/pages/app/RentalFormPage'))
const RentalsPage = lazy(() => import('@/pages/app/RentalsPage'))
const ReportsPage = lazy(() => import('@/pages/app/ReportsPage'))
const ConfirmEmailPage = lazy(() => import('@/pages/auth/ConfirmEmailPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'))
const SetupPage = lazy(() => import('@/pages/auth/SetupPage'))

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-ink-50 text-sm text-ink-500">
          Loading page…
        </div>
      }
    >
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
        path="/confirm-email"
        element={
          <RedirectIfAuthenticated>
            <ConfirmEmailPage />
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
    </Suspense>
  )
}
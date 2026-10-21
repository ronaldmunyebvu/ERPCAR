import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAuth, RequireDuty, RedirectIfAuthenticated, NotFound } from '@/components/layout/Guards'
const AccountPage = lazy(() => import('@/pages/app/AccountPage'))
const ActivityPage = lazy(() => import('@/pages/app/ActivityPage'))
const CashbookPage = lazy(() => import('@/pages/app/CashbookPage'))
const CompanyPage = lazy(() => import('@/pages/app/CompanyPage'))
const CustomersPage = lazy(() => import('@/pages/app/CustomersPage'))
const DashboardPage = lazy(() => import('@/pages/app/DashboardPage'))
const FleetPage = lazy(() => import('@/pages/app/FleetPage'))
const MaintenancePage = lazy(() => import('@/pages/app/MaintenancePage'))
const MembersPage = lazy(() => import('@/pages/app/MembersPage'))
const RentalDetailPage = lazy(() => import('@/pages/app/RentalDetailPage'))
const RentalFormPage = lazy(() => import('@/pages/app/RentalFormPage'))
const RentalsPage = lazy(() => import('@/pages/app/RentalsPage'))
const ReportsPage = lazy(() => import('@/pages/app/ReportsPage'))
const ConfirmEmailPage = lazy(() => import('@/pages/auth/ConfirmEmailPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const MemberSetupPage = lazy(() => import('@/pages/auth/MemberSetupPage'))
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
        path="/setup-member"
        element={
          <RedirectIfAuthenticated>
            <MemberSetupPage />
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
        <Route
          path="rentals"
          element={
            <RequireDuty duty="rentals">
              <RentalsPage />
            </RequireDuty>
          }
        />
        <Route
          path="rentals/new"
          element={
            <RequireDuty duty="rentals">
              <RentalFormPage />
            </RequireDuty>
          }
        />
        <Route
          path="rentals/:id"
          element={
            <RequireDuty duty="rentals">
              <RentalDetailPage />
            </RequireDuty>
          }
        />
        <Route
          path="rentals/:id/edit"
          element={
            <RequireDuty duty="rentals">
              <RentalFormPage />
            </RequireDuty>
          }
        />
        <Route
          path="fleet"
          element={
            <RequireDuty duty="fleet">
              <FleetPage />
            </RequireDuty>
          }
        />
        <Route
          path="customers"
          element={
            <RequireDuty duty="customers">
              <CustomersPage />
            </RequireDuty>
          }
        />
        <Route
          path="cashbook"
          element={
            <RequireDuty duty="cashbook">
              <CashbookPage />
            </RequireDuty>
          }
        />
        <Route path="payments" element={<Navigate to="/app/cashbook" replace />} />
        <Route
          path="maintenance"
          element={
            <RequireDuty duty="maintenance">
              <MaintenancePage />
            </RequireDuty>
          }
        />
        <Route
          path="reports"
          element={
            <RequireDuty duty="reports">
              <ReportsPage />
            </RequireDuty>
          }
        />
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
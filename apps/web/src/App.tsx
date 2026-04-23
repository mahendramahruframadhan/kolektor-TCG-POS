import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client.js";
import { useAuthStore } from "./store/auth.js";
import { LoginPage } from "./pages/LoginPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { POSPage } from "./pages/POSPage.js";
import { IntakePage } from "./pages/IntakePage.js";
import { InventoryPage } from "./pages/InventoryPage.js";
import { ReportsPage } from "./pages/ReportsPage.js";
import { AdminPage } from "./pages/AdminPage.js";
import { UsersAdminPage } from "./pages/UsersAdminPage.js";
import { EventsAdminPage } from "./pages/EventsAdminPage.js";
import { OversoldQueuePage } from "./pages/OversoldQueuePage.js";
import { CashReconciliationPage } from "./pages/CashReconciliationPage.js";
import { BulkImportPage } from "./pages/BulkImportPage.js";
import { ChangePasswordPage } from "./pages/ChangePasswordPage.js";
import { DocsPage } from "./pages/DocsPage.js";
import { QRLabelPage } from "./pages/QRLabelPage.js";
import { MyPayoutPage } from "./pages/MyPayoutPage.js";
import { LandingPage } from "./pages/LandingPage.js";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/pos"
            element={
              <RequireAuth>
                <POSPage />
              </RequireAuth>
            }
          />
          <Route
            path="/inventory"
            element={
              <RequireAuth>
                <InventoryPage />
              </RequireAuth>
            }
          />
          <Route
            path="/intake"
            element={
              <RequireAuth>
                <IntakePage />
              </RequireAuth>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireAuth>
                <ReportsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAdmin>
                <UsersAdminPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/events"
            element={
              <RequireAdmin>
                <EventsAdminPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/oversold"
            element={
              <RequireAdmin>
                <OversoldQueuePage />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/cash-reconciliation"
            element={
              <RequireAdmin>
                <CashReconciliationPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/intake/bulk"
            element={
              <RequireAuth>
                <BulkImportPage />
              </RequireAuth>
            }
          />
          <Route
            path="/change-password"
            element={
              <RequireAuth>
                <ChangePasswordPage />
              </RequireAuth>
            }
          />
          <Route
            path="/labels"
            element={
              <RequireAuth>
                <QRLabelPage />
              </RequireAuth>
            }
          />
          <Route path="/docs" element={<DocsPage />} />
          <Route
            path="/my-payout"
            element={
              <RequireAuth>
                <MyPayoutPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

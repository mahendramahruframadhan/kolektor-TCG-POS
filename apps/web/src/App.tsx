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
import { OversoldQueuePage } from "./pages/OversoldQueuePage.js";
import { CashReconciliationPage } from "./pages/CashReconciliationPage.js";

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
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

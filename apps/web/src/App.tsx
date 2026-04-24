import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client.js";
import { useAuthStore } from "./store/auth.js";
import { LoginPage } from "./pages/LoginPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { POSPage } from "./pages/POSPage.js";
import { StockReceivePage } from "./pages/StockReceivePage.js";
import { InventoryPage } from "./pages/InventoryPage.js";
import { ReportsPage } from "./pages/ReportsPage.js";
import { AdminPage } from "./pages/AdminPage.js";
import { UsersAdminPage } from "./pages/UsersAdminPage.js";
import { EventsAdminPage } from "./pages/EventsAdminPage.js";
import { OversoldQueuePage } from "./pages/OversoldQueuePage.js";
import { AuditLogPage } from "./pages/AuditLogPage.js";
import { OverrideHistoryPage } from "./pages/OverrideHistoryPage.js";
import { TransactionDetailPage } from "./pages/TransactionDetailPage.js";
import { BulkImportPage } from "./pages/BulkImportPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:text-primary-fg focus:px-4 focus:py-2 focus:rounded-xl focus:font-bold focus:shadow-lg focus:ring-2 focus:ring-accent"
        >
          Lewati ke konten utama
        </a>
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
            path="/stock-receive"
            element={
              <RequireAuth>
                <StockReceivePage />
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
            path="/settings"
            element={
              <RequireAdmin>
                <AdminPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/settings/users"
            element={
              <RequireAdmin>
                <UsersAdminPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/settings/events"
            element={
              <RequireAdmin>
                <EventsAdminPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/settings/oversold"
            element={
              <RequireAdmin>
                <OversoldQueuePage />
              </RequireAdmin>
            }
          />
          <Route
            path="/settings/audit-log"
            element={
              <RequireAdmin>
                <AuditLogPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/settings/overrides"
            element={
              <RequireAdmin>
                <OverrideHistoryPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/transactions/:id"
            element={
              <RequireAuth>
                <TransactionDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/stock-receive/bulk"
            element={
              <RequireAuth>
                <BulkImportPage />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
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

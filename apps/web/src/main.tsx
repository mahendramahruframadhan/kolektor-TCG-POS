import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App.js";
import { startBackgroundSync } from "./lib/background-sync.js";
import { runAutomatedCleanup } from "./lib/storage-monitor.js";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");
createRoot(root).render(<App />);

// Start background sync (60s interval + opportunistic on cashier actions)
startBackgroundSync();

// Run automated cleanup on app start and every 6 hours (PRD §5.6)
runAutomatedCleanup().then((result) => {
  if (result.oldPendingTx + result.failedTx + result.abandonedCarts + result.oldEvents > 0) {
    console.log("[cleanup] Initial cleanup:", result);
  }
});
setInterval(() => {
  runAutomatedCleanup().catch(() => null);
}, 6 * 60 * 60 * 1000);

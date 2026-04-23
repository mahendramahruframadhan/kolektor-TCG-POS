import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App.js";
import { startBackgroundSync } from "./lib/background-sync.js";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");
createRoot(root).render(<App />);

// Start background sync (60s interval + opportunistic on cashier actions)
startBackgroundSync();

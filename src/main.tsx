import React from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import { ErrorBoundary } from "./ui/components/ErrorBoundary";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    {/* No-ops anywhere except an actual Vercel deployment — safe to leave
        wired in local dev and on other hosts. */}
    <Analytics />
  </React.StrictMode>
);

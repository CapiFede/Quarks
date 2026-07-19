import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./frontend/sections/ErrorBoundary";
import { ErrorOverlay } from "./frontend/sections/ErrorOverlay";
import { installGlobalErrorHandlers } from "./services/log";
import "./frontend/styles/tokens.css";
import "./frontend/styles/global.css";

installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    {/* Hermano del boundary: el popup sigue visible aunque la app caiga. */}
    <ErrorOverlay />
  </React.StrictMode>,
);

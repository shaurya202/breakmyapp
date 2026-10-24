import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ConvexProviderApp } from "./convex";
import { Router } from "./router";
import ErrorBoundary from "./components/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProviderApp>
      <Router>{(route) => <ErrorBoundary key={route.name === "audit" ? route.id : "landing"}><App route={route} /></ErrorBoundary>}</Router>
    </ConvexProviderApp>
  </StrictMode>
);

import { useEffect } from "react";
import { useAuth } from "@workos-inc/authkit-react";
import LandingPage from "./routes/LandingPage";
import ReportPage from "./routes/ReportPage";
import type { Route } from "./router";

export default function App({ route }: { route: Route }) {
  const { signIn } = useAuth();

  // WorkOS Admin impersonation / initiate-login flows land on /login, which
  // this tiny router maps to "landing" — start the OAuth flow there instead.
  useEffect(() => {
    if (window.location.pathname === "/login") {
      void signIn();
    }
  }, [signIn]);

  if (route.name === "audit") {
    return <ReportPage auditId={route.id} />;
  }
  return <LandingPage />;
}

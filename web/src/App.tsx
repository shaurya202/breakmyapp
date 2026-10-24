import LandingPage from "./routes/LandingPage";
import ReportPage from "./routes/ReportPage";
import type { Route } from "./router";

export default function App({ route }: { route: Route }) {
  if (route.name === "audit") {
    return <ReportPage auditId={route.id} />;
  }
  return <LandingPage />;
}

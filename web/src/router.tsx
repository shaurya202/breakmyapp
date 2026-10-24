import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/** Tiny history router — no external routing dependency. */

export type Route =
  | { name: "landing" }
  | { name: "audit"; id: string }
  | { name: "legal"; doc: "privacy" | "terms" };

function parsePath(pathname: string): Route {
  const m = /^\/audit\/([a-z0-9]+)\/?$/i.exec(pathname);
  if (m) return { name: "audit", id: m[1] };
  if (/^\/(privacy|privacy\.html)\/?$/i.test(pathname)) return { name: "legal", doc: "privacy" };
  if (/^\/(terms|terms\.html)\/?$/i.test(pathname)) return { name: "legal", doc: "terms" };
  return { name: "landing" };
}

export function navigate(path: string) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

const RouteCtx = createContext<Route>({ name: "landing" });
export function useRoute() {
  return useContext(RouteCtx);
}

export function Router({ children }: { children: (route: Route) => ReactNode }) {
  const [route, setRoute] = useState<Route>(() =>
    parsePath(window.location.pathname)
  );
  useEffect(() => {
    const onPop = () => {
      setRoute(parsePath(window.location.pathname));
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return <RouteCtx.Provider value={route}>{children(route)}</RouteCtx.Provider>;
}

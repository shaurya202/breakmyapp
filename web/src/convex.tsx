import { ConvexProvider, ConvexReactClient, useConvex } from "convex/react";
import type { ReactNode } from "react";

const client = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL ?? "https://limitless-schnauzer-971.convex.cloud"
);

export function ConvexProviderApp({ children }: { children: ReactNode }) {
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}

export function useClient() {
  return useConvex();
}

export { client };

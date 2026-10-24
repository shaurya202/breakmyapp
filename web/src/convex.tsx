import { ConvexReactClient, useConvex } from "convex/react";
import { ConvexProviderWithAuthKit } from "@convex-dev/workos";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import type { ReactNode } from "react";

const client = new ConvexReactClient(
  // Production fallback: Cloudflare's fresh-clone builds run with no VITE_* env,
  // so the baked bundle must target the production deployment, not dev.
  import.meta.env.VITE_CONVEX_URL ?? "https://different-yak-12.convex.cloud"
);

// Public (safe for the bundle) WorkOS AuthKit credentials from web/.env.
// When VITE_WORKOS_CLIENT_ID is unset the account + sign-in UI hides itself
// and the app keeps running unauthenticated (same degrade path as Whop).
export const authConfigured = Boolean(import.meta.env.VITE_WORKOS_CLIENT_ID);

const workosClientId = import.meta.env.VITE_WORKOS_CLIENT_ID ?? "";
const workosRedirectUri =
  import.meta.env.VITE_WORKOS_REDIRECT_URI ?? `${window.location.origin}/callback`;

export function ConvexProviderApp({ children }: { children: ReactNode }) {
  return (
    <AuthKitProvider clientId={workosClientId} redirectUri={workosRedirectUri}>
      <ConvexProviderWithAuthKit client={client} useAuth={useAuth}>
        {children}
      </ConvexProviderWithAuthKit>
    </AuthKitProvider>
  );
}

export function useClient() {
  return useConvex();
}

export { client };

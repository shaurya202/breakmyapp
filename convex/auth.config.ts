// auth.config.ts — Convex server-side JWT validation for WorkOS AuthKit.
//
// Follows the official Convex × WorkOS AuthKit recipe: both issuer shapes are
// registered so older and newer AuthKit access tokens validate. The public
// key is fetched from WorkOS's JWKS endpoint, so the token signature (not any
// client-supplied claim) is what authenticates a request — the same trust
// model the Whop webhook handler uses for money-state.
//
// WORKOS_CLIENT_ID is a Convex deployment env var:
//   npx convex env set WORKOS_CLIENT_ID client_01...
const clientId = process.env.WORKOS_CLIENT_ID;

const authConfig = {
  providers: [
    {
      type: "customJwt",
      issuer: `https://api.workos.com/`,
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      applicationID: clientId,
    },
    {
      type: "customJwt",
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
  ],
} as const;

export default authConfig;

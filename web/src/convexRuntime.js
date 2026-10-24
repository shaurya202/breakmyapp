// @ts-nocheck
// Runtime-only re-export of the generated Convex API. Isolated in its own
// module so the web program's typecheck never pulls the backend's source
// modules (which carry node-only types like Buffer) into the frontend graph.
export { api } from "../../convex/_generated/api";

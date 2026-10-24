/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audits from "../audits.js";
import type * as crons from "../crons.js";
import type * as deterministic from "../deterministic.js";
import type * as exaHunter from "../exaHunter.js";
import type * as http from "../http.js";
import type * as hunterBridge from "../hunterBridge.js";
import type * as operations from "../operations.js";
import type * as outreachBridge from "../outreachBridge.js";
import type * as outreachSender from "../outreachSender.js";
import type * as runnerBridge from "../runnerBridge.js";
import type * as shield from "../shield.js";
import type * as solariRunner from "../solariRunner.js";
import type * as terac from "../terac.js";
import type * as teracBridge from "../teracBridge.js";
import type * as treasury from "../treasury.js";
import type * as whop from "../whop.js";
import type * as whopBridge from "../whopBridge.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audits: typeof audits;
  crons: typeof crons;
  deterministic: typeof deterministic;
  exaHunter: typeof exaHunter;
  http: typeof http;
  hunterBridge: typeof hunterBridge;
  operations: typeof operations;
  outreachBridge: typeof outreachBridge;
  outreachSender: typeof outreachSender;
  runnerBridge: typeof runnerBridge;
  shield: typeof shield;
  solariRunner: typeof solariRunner;
  terac: typeof terac;
  teracBridge: typeof teracBridge;
  treasury: typeof treasury;
  whop: typeof whop;
  whopBridge: typeof whopBridge;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

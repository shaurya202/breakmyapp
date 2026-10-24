import { defineApp } from "convex/server";
import { v } from "convex/values";

/** Env vars the Convex functions need. Set with `npx convex env set KEY ...` */
export default defineApp({
  env: {
    SOLARI_API_KEY: v.optional(v.string()),
    SOLARI_BASE_URL: v.optional(v.string()),
    EXA_API_KEY: v.optional(v.string()),
    WHOP_API_KEY: v.optional(v.string()),
    WHOP_WEBHOOK_SECRET: v.optional(v.string()),
    WHOP_PLAN_ID_FULL_AUTOPSY: v.optional(v.string()),
    WHOP_PLAN_ID_SHIELD: v.optional(v.string()),
    WHOP_COMPANY_ID: v.optional(v.string()),
    APP_BASE_URL: v.optional(v.string()),
    TERAC_API_KEY: v.optional(v.string()),
    TERAC_BASE_URL: v.optional(v.string()),
    TERAC_STUDY_LAUNCH_TOKEN: v.optional(v.string()),
    OUTREACH_ENABLED: v.optional(v.string()),
    GMAIL_CLIENT_ID: v.optional(v.string()),
    GMAIL_CLIENT_SECRET: v.optional(v.string()),
    GMAIL_REFRESH_TOKEN: v.optional(v.string()),
    GMAIL_SENDER_EMAIL: v.optional(v.string()),
  },
});

// Keep `v` import used — defineApp env validators are plain validator values.
void v;

import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

type QueueStatus = {
  waiting: number; sending: number; unknown: number;
  sent: number; replied: number; optedOut: number;
};
type Readiness = {
  exaConfigured: boolean; solariConfigured: boolean;
  whopConfigured: boolean; publicAppConfigured: boolean;
  outreachEnabled: boolean; gmailConfigured: boolean;
  queue: QueueStatus;
};

/** Operator-only configuration status; never returns credential values. */
export const readiness = internalAction({
  args: {},
  returns: v.object({
    exaConfigured: v.boolean(), solariConfigured: v.boolean(),
    whopConfigured: v.boolean(), publicAppConfigured: v.boolean(),
    outreachEnabled: v.boolean(), gmailConfigured: v.boolean(),
    queue: v.object({
      waiting: v.number(), sending: v.number(), unknown: v.number(),
      sent: v.number(), replied: v.number(), optedOut: v.number(),
    }),
  }),
  handler: async (ctx): Promise<Readiness> => {
    const queue: QueueStatus = await ctx.runQuery(internal.outreachBridge.queueStatus, {});
    return {
      exaConfigured: !!env.EXA_API_KEY,
      solariConfigured: !!env.SOLARI_API_KEY,
      whopConfigured: !!env.WHOP_API_KEY && !!env.WHOP_WEBHOOK_SECRET &&
        !!env.WHOP_PLAN_ID_FULL_AUTOPSY && !!env.WHOP_PLAN_ID_SHIELD,
      publicAppConfigured: !!env.APP_BASE_URL?.startsWith("https://"),
      outreachEnabled: env.OUTREACH_ENABLED === "true",
      gmailConfigured: !!env.GMAIL_CLIENT_ID && !!env.GMAIL_CLIENT_SECRET &&
        !!env.GMAIL_REFRESH_TOKEN && !!env.GMAIL_SENDER_EMAIL,
      queue,
    };
  },
});

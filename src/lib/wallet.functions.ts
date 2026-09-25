import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const amountSchema = z.object({
  amount: z.number().positive().max(1_000_000).multipleOf(0.01),
});

const milestoneSchema = z.object({
  milestone: z.union([z.literal(100), z.literal(200), z.literal(500)]),
});

export const loadWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: walletRows, error: walletError } = await supabaseAdmin.rpc(
      "check_in_wallet",
      { uid_in: context.userId },
    );
    if (walletError) throw new Error(walletError.message);

    const { data: transactions, error: transactionError } = await context.supabase
      .from("wallet_transactions")
      .select("id, kind, amount, coins, description, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (transactionError) throw new Error(transactionError.message);

    const wallet = walletRows?.[0];
    if (!wallet) throw new Error("Wallet could not be loaded");
    return { wallet, transactions: transactions ?? [] };
  });

export const addMoney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => amountSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("add_wallet_money", {
      uid_in: context.userId,
      amount_in: data.amount,
    });
    if (error) throw new Error(error.message);
    return result?.[0];
  });

export const claimReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => milestoneSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("claim_streak_reward", {
      uid_in: context.userId,
      milestone_in: data.milestone,
    });
    if (error) throw new Error(error.message);
    return result?.[0];
  });
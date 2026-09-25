import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const amountSchema = z.object({
  amount: z.number().positive().max(1_000_000).multipleOf(0.01),
});

const milestoneSchema = z.object({
  milestone: z.union([z.literal(100), z.literal(200), z.literal(500)]),
});

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export const loadWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await admin();
    const { data: walletRows, error: walletError } = await supabaseAdmin.rpc("check_in_wallet", { uid_in: context.userId });
    if (walletError) throw new Error(walletError.message);
    const checkIn = walletRows?.[0];
    if (!checkIn) throw new Error("Wallet could not be loaded");

    const [{ data: row, error: rowError }, { data: transactions, error: txError }, { data: notifications, error: nError }] = await Promise.all([
      context.supabase.from("wallets").select("*").eq("user_id", context.userId).single(),
      context.supabase.from("wallet_transactions").select("id, kind, amount, coins, description, created_at").order("created_at", { ascending: false }).limit(100),
      context.supabase.from("notifications").select("id, title, body, is_read, created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    if (rowError) throw new Error(rowError.message);
    if (txError) throw new Error(txError.message);
    if (nError) throw new Error(nError.message);

    const freeLimit = row.is_vip ? 2 : 1;
    const freeLeft = Math.max(0, freeLimit - row.spins_used);
    const spin = {
      freeLeft,
      bonusAvailable: row.bonus_spin_available,
      canWatchAd: freeLeft === 0 && row.last_spin_result === "try_again" && !row.bonus_spin_granted && !row.bonus_spin_available,
    };
    const email = (context.claims as { email?: string }).email ?? "";

    return {
      wallet: { ...row, pending_milestone: checkIn.pending_milestone },
      spin,
      user: { id: context.userId, email },
      transactions: transactions ?? [],
      notifications: notifications ?? [],
    };
  });

export const addMoney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => amountSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (await admin()).rpc("add_wallet_money", { uid_in: context.userId, amount_in: data.amount });
    if (error) throw new Error(error.message);
    return result?.[0];
  });

export const claimReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => milestoneSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (await admin()).rpc("claim_streak_reward", { uid_in: context.userId, milestone_in: data.milestone });
    if (error) throw new Error(error.message);
    return result?.[0];
  });

export const buyVip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await (await admin()).rpc("buy_vip", { uid_in: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const spinWheel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (await admin()).rpc("spin_wheel", { uid_in: context.userId });
    if (error) throw new Error(error.message);
    return { prize: data?.[0]?.prize ?? 0 };
  });

export const unlockSpinAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await (await admin()).rpc("grant_spin_ad", { uid_in: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const watchAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await (await admin()).rpc("watch_video_ad", { uid_in: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const redeemReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().trim().min(4).max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (await admin()).rpc("redeem_referral", { uid_in: context.userId, code_in: data.code });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("notifications").update({ is_read: true }).eq("user_id", context.userId).eq("is_read", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

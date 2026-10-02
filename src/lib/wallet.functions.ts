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
    const pendingMilestone = walletRows as number | null;

    const [{ data: row, error: rowError }, { data: transactions, error: txError }, { data: notifications, error: nError }] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", context.userId).single(),
      context.supabase.from("wallet_transactions").select("id, kind, amount, coins, description, created_at").order("created_at", { ascending: false }).limit(100),
      context.supabase.from("notifications").select("id, title, body, is_read, created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    if (rowError) throw new Error(rowError.message);
    if (txError) throw new Error(txError.message);
    if (nError) throw new Error(nError.message);

    const freeLimit = 1;
    const freeLeft = Math.max(0, freeLimit - row.spins_used);
    const spin = {
      freeLeft,
      bonusAvailable: row.bonus_spin_available,
      canWatchAd: freeLeft === 0 && row.last_spin_result === "try_again" && !row.bonus_spin_granted && !row.bonus_spin_available,
    };
    const email = (context.claims as { email?: string }).email ?? "";

    return {
      wallet: { ...row, balance: row.smart_money, coins: row.smart_coins, current_streak: row.streak, pending_milestone: pendingMilestone },
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
    const { data: result, error } = await (await admin()).rpc("request_deposit", { uid_in: context.userId, amount_in: data.amount, utr_in: "" });
    if (error) throw new Error(error.message);
    return result;
  });

export const claimReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => milestoneSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (await admin()).rpc("claim_streak_reward", { uid_in: context.userId, milestone_in: data.milestone });
    if (error) throw new Error(error.message);
    return { awarded: result };
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
    return { prize: data ?? 0 };
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

export const loadWeeklyReferrers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 7);
    const db = await admin();
    const { data: rows, error } = await db
      .from("wallet_transactions")
      .select("user_id")
      .eq("kind", "referral")
      .gte("created_at", since.toISOString());
    if (error) throw new Error(error.message);

    const counts = new Map<string, number>();
    for (const row of rows ?? []) counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
    const ids = [...counts.keys()];
    if (ids.length === 0) return [];

    const { data: profiles, error: profileError } = await db
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    if (profileError) throw new Error(profileError.message);

    return (profiles ?? [])
      .map((profile) => ({
        label: profile.full_name?.trim().split(/\s+/)[0] || `Saver ${profile.id.slice(0, 4).toUpperCase()}`,
        referrals: counts.get(profile.id) ?? 0,
      }))
      .sort((a, b) => b.referrals - a.referrals)
      .slice(0, 3);
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("notifications").update({ is_read: true }).eq("user_id", context.userId).eq("is_read", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function rpc(name: string, args: Record<string, unknown>) {
  const client = await admin();
  const { data, error } = await (client.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export const loadGoals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [g, d, w] = await Promise.all([
      context.supabase.from("savings_goals").select("*").eq("status", "active").order("created_at"),
      context.supabase.from("deposit_requests").select("id, amount, status, created_at").order("created_at", { ascending: false }).limit(10),
      context.supabase.from("withdrawal_requests").select("id, amount, upi_id, status, created_at").order("created_at", { ascending: false }).limit(10),
    ]);
    return { goals: g.data ?? [], deposits: d.data ?? [], withdrawals: w.data ?? [] };
  });

export const requestDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ amount: z.number().min(10).max(100000), utr: z.string().regex(/^\d{12}$/), purpose: z.enum(["deposit", "vip"]).default("deposit") }).parse(i))
  .handler(async ({ data, context }) => { await rpc("request_deposit_for", { uid_in: context.userId, amount_in: data.amount, utr_in: data.utr, purpose_in: data.purpose }); return { ok: true }; });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ amount: z.number().min(10).max(100000), upi: z.string().trim().regex(/^[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}$/) }).parse(i))
  .handler(async ({ data, context }) => { await rpc("request_withdrawal", { uid_in: context.userId, amount_in: data.amount, upi_in: data.upi }); return { ok: true }; });

export const convertCoins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ money: Number(await rpc("convert_coins", { uid_in: context.userId })) }));

export const createGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ title: z.string().trim().min(1).max(60), target: z.number().min(1).max(10_000_000) }).parse(i))
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase.from("savings_goals").select("id", { count: "exact", head: true }).eq("status", "active");
    if ((count ?? 0) >= 5) throw new Error("You can have up to 5 active goals");
    await rpc("create_goal", { uid_in: context.userId, title_in: data.title, target_in: data.target }); return { ok: true };
  });

export const fundGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ goal: z.string().uuid(), amount: z.number().positive().max(10_000_000) }).parse(i))
  .handler(async ({ data, context }) => { await rpc("fund_goal", { uid_in: context.userId, goal_in: data.goal, amount_in: data.amount }); return { ok: true }; });

export const breakGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ goal: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => ({ penalty: Number(await rpc("break_goal", { uid_in: context.userId, goal_in: data.goal })) }));


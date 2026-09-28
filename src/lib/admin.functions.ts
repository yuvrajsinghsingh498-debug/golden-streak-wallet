import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_EMAIL = "yuvrajsinghsingh498@gmail.com";
type Ctx = { claims: { email?: string }; supabase: { rpc: (n: "has_role", a: { _user_id: string; _role: "admin" }) => PromiseLike<{ data: boolean | null }> }; userId: string };

async function requireAdmin(context: Ctx) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data || (context.claims.email ?? "").toLowerCase() !== ADMIN_EMAIL) throw new Error("Access denied");
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export const checkAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const email = ((context.claims as { email?: string }).email ?? "").toLowerCase();
    return { isAdmin: Boolean(data) && email === ADMIN_EMAIL };
  });

export const adminLoad = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context as unknown as Ctx);
    const [u, d, w] = await Promise.all([
      db.from("profiles").select("id, email, full_name, smart_money, smart_coins, streak, is_vip, dob, gender, default_upi, bank_name, bank_account_no, bank_ifsc").order("created_at", { ascending: false }).limit(500),
      db.from("deposit_requests").select("*").eq("status", "pending").order("created_at"),
      db.from("withdrawal_requests").select("*").eq("status", "pending").order("created_at"),
    ]);
    return { users: u.data ?? [], deposits: d.data ?? [], withdrawals: w.data ?? [] };
  });

async function call(db: Awaited<ReturnType<typeof requireAdmin>>, name: string, args: Record<string, unknown>) {
  const { error } = await (db.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(name, args);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export const adminToggleVip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ user: z.string().uuid(), vip: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context as unknown as Ctx);
    const { error } = await db.from("profiles").update({ is_vip: data.vip, vip_since: data.vip ? new Date().toISOString() : null }).eq("id", data.user);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminAdjust = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ user: z.string().uuid(), money: z.number().min(-1e7).max(1e7), coins: z.number().int().min(-1e9).max(1e9), note: z.string().trim().min(1).max(120) }).parse(i))
  .handler(async ({ data, context }) => call(await requireAdmin(context as unknown as Ctx), "admin_adjust", { target_in: data.user, money_in: data.money, coins_in: data.coins, note_in: data.note }));

export const adminReviewDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => call(await requireAdmin(context as unknown as Ctx), "admin_review_deposit", { req_in: data.id, approve_in: data.approve }));

export const adminPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), approve: z.boolean(), utr: z.string().trim().max(40) }).parse(i))
  .handler(async ({ data, context }) => call(await requireAdmin(context as unknown as Ctx), "admin_payout", { req_in: data.id, approve_in: data.approve, utr_in: data.utr }));

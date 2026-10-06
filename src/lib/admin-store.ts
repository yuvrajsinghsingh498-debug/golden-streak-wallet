import {
  collection, doc, getDocs, increment, limit, query, runTransaction, serverTimestamp, Timestamp, updateDoc, where, type Transaction,
} from "firebase/firestore";

import { ADMIN_EMAIL, getDb, getFirebaseAuth } from "@/lib/firebase";

const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : new Date().toISOString());

function requireAdmin() {
  const u = getFirebaseAuth().currentUser;
  if (!u || (u.email ?? "").toLowerCase() !== ADMIN_EMAIL) throw new Error("Access denied");
  return getDb();
}
function note(t: Transaction, uid: string, title: string, body: string) {
  t.set(doc(collection(getDb(), "User", uid, "notifications")), { title, body, is_read: false, created_at: serverTimestamp() });
}
function tx(t: Transaction, uid: string, kind: string, amount: number, coins: number, description: string) {
  t.set(doc(collection(getDb(), "User", uid, "transactions")), { kind, amount, coins, description, created_at: serverTimestamp() });
}

export async function checkAdmin() {
  const u = getFirebaseAuth().currentUser;
  return { isAdmin: (u?.email ?? "").toLowerCase() === ADMIN_EMAIL };
}

export async function adminLoad() {
  const db = requireAdmin();
  const [u, d, w] = await Promise.all([
    getDocs(query(collection(db, "User"), limit(500))),
    getDocs(query(collection(db, "deposits"), where("status", "==", "pending"))),
    getDocs(query(collection(db, "withdrawals"), where("status", "==", "pending"))),
  ]);
  return {
    users: u.docs.map((x) => ({ id: x.id, email: String(x.get("email") ?? ""), smart_money: Number(x.get("withdrawableBalance") ?? 0), smart_coins: Number(x.get("coins") ?? 0), is_vip: Boolean(x.get("isVIP")), streak: Number(x.get("currentStreak") ?? 0) })),
    deposits: d.docs.map((x) => ({ id: x.id, user_id: String(x.get("user_id")), user_email: String(x.get("email") ?? ""), amount: Number(x.get("amount")), purpose: String(x.get("purpose") ?? "deposit"), utr_number: String(x.get("txn_id") ?? ""), created_at: iso(x.get("created_at")) })),
    withdrawals: w.docs.map((x) => ({ id: x.id, user_id: String(x.get("user_id")), user_email: String(x.get("email") ?? ""), amount: Number(x.get("amount")), upi_id: String(x.get("upi_id")), created_at: iso(x.get("created_at")) })),
  };
}

export async function adminReviewDeposit({ data }: { data: { id: string; approve: boolean } }) {
  const db = requireAdmin();
  await runTransaction(db, async (t) => {
    const ref = doc(db, "deposits", data.id); const s = await t.get(ref);
    if (s.get("status") !== "pending") throw new Error("Already reviewed");
    const uid = String(s.get("user_id")); const amount = Number(s.get("amount")); const vip = s.get("purpose") === "vip";
    t.update(ref, { status: data.approve ? "success" : "rejected", reviewed_at: serverTimestamp() });
    if (!data.approve) { note(t, uid, "Payment rejected", `Your ₹${amount} payment could not be verified.`); return; }
    if (vip) { t.update(doc(db, "User", uid), { isVIP: true, vipSince: serverTimestamp() }); tx(t, uid, "vip", 0, 0, "VIP Pass via UPI"); note(t, uid, "VIP activated", "Your VIP Pass is now active."); }
    else { t.update(doc(db, "User", uid), { withdrawableBalance: increment(amount), totalDeposited: increment(amount) }); tx(t, uid, "deposit", amount, 0, "UPI deposit"); note(t, uid, "Money credited", `₹${amount} Smart Money added to your wallet.`); }
  });
}

export async function adminPayout({ data }: { data: { id: string; approve: boolean; utr: string } }) {
  const db = requireAdmin();
  await runTransaction(db, async (t) => {
    const ref = doc(db, "withdrawals", data.id); const s = await t.get(ref);
    if (s.get("status") !== "pending") throw new Error("Already reviewed");
    const uid = String(s.get("user_id")); const amount = Number(s.get("amount"));
    t.update(ref, { status: data.approve ? "approved" : "rejected", payout_utr: data.utr, reviewed_at: serverTimestamp() });
    if (data.approve) { t.update(doc(db, "User", uid), { totalWithdrawn: increment(amount) }); note(t, uid, "Withdrawal approved", `₹${amount} has been sent. Ref ${data.utr}.`); }
    else { t.update(doc(db, "User", uid), { withdrawableBalance: increment(amount) }); tx(t, uid, "refund", amount, 0, "Withdrawal refunded"); note(t, uid, "Withdrawal rejected", `₹${amount} was refunded to your wallet.`); }
  });
}

export async function adminToggleVip({ data }: { data: { user: string; vip: boolean } }) {
  const db = requireAdmin();
  await updateDoc(doc(db, "User", data.user), { isVIP: data.vip, vipSince: data.vip ? serverTimestamp() : null });
}

export async function adminAdjust({ data }: { data: { user: string; money: number; coins: number; note: string } }) {
  const db = requireAdmin();
  await runTransaction(db, async (t) => {
    t.update(doc(db, "User", data.user), { withdrawableBalance: increment(data.money), coins: increment(data.coins) });
    tx(t, data.user, "adjustment", data.money, data.coins, data.note);
    if (data.money > 0 || data.coins > 0) note(t, data.user, "Wallet credited", data.note);
  });
}

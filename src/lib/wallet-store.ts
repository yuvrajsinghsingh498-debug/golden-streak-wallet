import {
  addDoc, collection, doc, getDoc, getDocs, increment, limit, orderBy, query, runTransaction,
  serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch, type DocumentData, type Transaction,
} from "firebase/firestore";

import { getDb, getFirebaseAuth } from "@/lib/firebase";
import { pushLocal } from "@/lib/push";

export const MILESTONES = { 100: 1000, 200: 2020, 500: 6000 } as const;
const SPIN_PRIZES = [10, 20, 50, 100, 200, 0];
const day = (d = new Date()) => d.toISOString().slice(0, 10);
const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : typeof v === "string" ? v : new Date().toISOString());

function me() {
  const u = getFirebaseAuth().currentUser;
  if (!u) throw new Error("Please sign in to continue");
  return u;
}
const userRef = (uid: string) => doc(getDb(), "User", uid);
const sub = (uid: string, name: string) => collection(getDb(), "User", uid, name);

function addTx(t: Transaction, uid: string, kind: string, amount: number, coins: number, description: string) {
  t.set(doc(sub(uid, "transactions")), { kind, amount, coins, description, created_at: serverTimestamp() });
}
function addNote(t: Transaction, uid: string, title: string, body: string) {
  t.set(doc(sub(uid, "notifications")), { title, body, is_read: false, created_at: serverTimestamp() });
}

function makeCode(uid: string) { return `SS${uid.slice(0, 6).toUpperCase()}`; }

/** Creates or syncs User/{uid} and runs the daily streak check. */
export async function syncUser() {
  const u = me();
  const ref = userRef(u.uid);
  return runTransaction(getDb(), async (t) => {
    const snap = await t.get(ref);
    const today = day();
    if (!snap.exists()) {
      t.set(ref, {
        uid: u.uid, email: u.email ?? "", phoneNumber: u.phoneNumber ?? "", status: "Active", isVIP: false,
        coins: 0, withdrawableBalance: 0, last_active: serverTimestamp(), createdAt: serverTimestamp(),
        currentStreak: 1, lastCheckDate: today, claimedMilestones: [], referralCode: makeCode(u.uid), referredBy: null,
        spinsUsed: 0, spinDate: today, bonusSpinAvailable: false, bonusSpinGranted: false, lastSpinResult: null, lastSpinAt: null,
        adsWatchedToday: 0, lastAdDate: null, lastAdAt: null, totalDeposited: 0, totalWithdrawn: 0, totalCoinsEarned: 0, pendingMilestone: null,
      });
      addNote(t, u.uid, "Welcome to Smart Saver", "Your account is ready. Check in daily to grow your streak.");
      return { isNew: true, streakChanged: true };
    }
    const d = snap.data();
    const patch: DocumentData = { last_active: serverTimestamp() };
    let streakChanged = false;
    if (d.lastCheckDate !== today) {
      const y = new Date(); y.setUTCDate(y.getUTCDate() - 1);
      const streak = d.lastCheckDate === day(y) ? (d.currentStreak ?? 0) + 1 : 1;
      patch.currentStreak = streak; patch.lastCheckDate = today; streakChanged = true;
      const bonus = MILESTONES[streak as keyof typeof MILESTONES];
      const claimed: number[] = d.claimedMilestones ?? [];
      if (bonus && !claimed.includes(streak)) {
        patch.coins = increment(bonus); patch.totalCoinsEarned = increment(bonus);
        patch.claimedMilestones = [...claimed, streak]; patch.pendingMilestone = streak;
        addTx(t, u.uid, "reward", 0, bonus, `${streak}-day streak bonus`);
        addNote(t, u.uid, "Streak milestone!", `+${bonus.toLocaleString("en-IN")} coins for your ${streak}-day streak.`);
      }
    }
    if (d.spinDate !== today) Object.assign(patch, { spinsUsed: 0, spinDate: today, bonusSpinAvailable: false, bonusSpinGranted: false, lastSpinResult: null });
    t.update(ref, patch);
    return { isNew: false, streakChanged };
  });
}

export async function loadWallet() {
  const u = me();
  const [snap, txs, notes] = await Promise.all([
    getDoc(userRef(u.uid)),
    getDocs(query(sub(u.uid, "transactions"), orderBy("created_at", "desc"), limit(100))),
    getDocs(query(sub(u.uid, "notifications"), orderBy("created_at", "desc"), limit(50))),
  ]);
  const d = snap.data() ?? {};
  const isVip = Boolean(d.isVIP);
  const freeLeft = Math.max(0, (isVip ? 2 : 1) - (d.spinsUsed ?? 0));
  return {
    wallet: {
      balance: Number(d.withdrawableBalance ?? 0), coins: Number(d.coins ?? 0), current_streak: Number(d.currentStreak ?? 1),
      is_vip: isVip, referral_code: String(d.referralCode ?? makeCode(u.uid)), referred_by: (d.referredBy ?? null) as string | null,
      ads_watched_today: Number(d.adsWatchedToday ?? 0), last_ad_date: (d.lastAdDate ?? null) as string | null,
      last_ad_at: d.lastAdAt ? iso(d.lastAdAt) : null, total_coins_earned: Number(d.totalCoinsEarned ?? 0),
      total_deposited: Number(d.totalDeposited ?? 0), default_upi: (d.defaultUpi ?? null) as string | null,
      pending_milestone: (d.pendingMilestone ?? null) as number | null, status: String(d.status ?? "Active"),
    },
    spin: { freeLeft, bonusAvailable: Boolean(d.bonusSpinAvailable), canWatchAd: freeLeft === 0 && d.lastSpinResult === "try_again" && !d.bonusSpinGranted && !d.bonusSpinAvailable },
    user: { id: u.uid, email: u.email ?? u.phoneNumber ?? "" },
    transactions: txs.docs.map((x) => ({ id: x.id, kind: String(x.get("kind")), amount: Number(x.get("amount") ?? 0), coins: Number(x.get("coins") ?? 0), description: String(x.get("description") ?? ""), created_at: iso(x.get("created_at")) })),
    notifications: notes.docs.map((x) => ({ id: x.id, title: String(x.get("title")), body: String(x.get("body") ?? ""), is_read: Boolean(x.get("is_read")), created_at: iso(x.get("created_at")) })),
  };
}

export async function claimReward({ data }: { data: { milestone: number } }) {
  const u = me();
  await updateDoc(userRef(u.uid), { pendingMilestone: null });
  return { awarded: MILESTONES[data.milestone as keyof typeof MILESTONES] ?? 0 };
}

export async function buyVip() {
  const u = me();
  await runTransaction(getDb(), async (t) => {
    const s = await t.get(userRef(u.uid));
    if (Number(s.get("withdrawableBalance") ?? 0) < 49) throw new Error("You need ₹49 Smart Money for VIP");
    t.update(userRef(u.uid), { withdrawableBalance: increment(-49), isVIP: true, vipSince: serverTimestamp() });
    addTx(t, u.uid, "vip", -49, 0, "VIP Pass (1 month)");
    addNote(t, u.uid, "VIP activated", "Enjoy double rewards and 50 ads per day.");
  });
}

export async function spinWheel() {
  const u = me();
  return runTransaction(getDb(), async (t) => {
    const s = await t.get(userRef(u.uid)); const d = s.data() ?? {};
    const vip = Boolean(d.isVIP); const free = (vip ? 2 : 1) - (d.spinsUsed ?? 0);
    if (free <= 0 && !d.bonusSpinAvailable) throw new Error("No spins left today");
    const prize = SPIN_PRIZES[Math.floor(Math.random() * SPIN_PRIZES.length)];
    const patch: DocumentData = { lastSpinResult: prize === 0 ? "try_again" : "win", lastSpinAt: serverTimestamp(), spinDate: day() };
    if (free > 0) patch.spinsUsed = increment(1); else patch.bonusSpinAvailable = false;
    if (prize > 0) {
      const won = prize * (vip ? 2 : 1);
      patch.coins = increment(won); patch.totalCoinsEarned = increment(won);
      addTx(t, u.uid, "spin", 0, won, "Daily spin reward");
      addNote(t, u.uid, "Coins credited", `+${won} coins from your daily spin.`);
    }
    t.update(userRef(u.uid), patch);
    return { prize };
  });
}

export async function unlockSpinAd() {
  const u = me();
  await runTransaction(getDb(), async (t) => {
    const d = (await t.get(userRef(u.uid))).data() ?? {};
    if (d.bonusSpinGranted || d.lastSpinResult !== "try_again") throw new Error("No extra spin available");
    t.update(userRef(u.uid), { bonusSpinAvailable: true, bonusSpinGranted: true });
  });
}

export async function watchAd() {
  const u = me();
  await runTransaction(getDb(), async (t) => {
    const d = (await t.get(userRef(u.uid))).data() ?? {};
    const vip = Boolean(d.isVIP); const today = day();
    const watched = d.lastAdDate === today ? Number(d.adsWatchedToday ?? 0) : 0;
    if (watched >= (vip ? 50 : 20)) throw new Error("Daily ad limit reached");
    const last = d.lastAdAt instanceof Timestamp ? d.lastAdAt.toMillis() : 0;
    if (Date.now() - last < 15000) throw new Error("Please wait before the next ad");
    const reward = vip ? 20 : 10;
    t.update(userRef(u.uid), { adsWatchedToday: watched + 1, lastAdDate: today, lastAdAt: serverTimestamp(), coins: increment(reward), totalCoinsEarned: increment(reward) });
    addTx(t, u.uid, "ad", 0, reward, "Video ad reward");
  });
}

export async function redeemReferral({ data }: { data: { code: string } }) {
  const u = me();
  const code = data.code.trim().toUpperCase();
  const found = await getDocs(query(collection(getDb(), "User"), where("referralCode", "==", code), limit(1)));
  const owner = found.docs[0];
  if (!owner) throw new Error("Referral code not found");
  if (owner.id === u.uid) throw new Error("You can't use your own code");
  await runTransaction(getDb(), async (t) => {
    const mine = await t.get(userRef(u.uid));
    if (mine.get("referredBy")) throw new Error("You've already used a referral code");
    t.update(userRef(u.uid), { referredBy: code });
    t.update(owner.ref, { coins: increment(1000), totalCoinsEarned: increment(1000) });
    addTx(t, owner.id, "referral", 0, 1000, "Referral bonus");
    addNote(t, owner.id, "Referral bonus", "+1,000 coins — a friend joined with your code.");
  });
}

export async function loadWeeklyReferrers() {
  return [] as { label: string; referrals: number }[];
}

export async function markNotificationsRead() {
  const u = me();
  const unread = await getDocs(query(sub(u.uid, "notifications"), where("is_read", "==", false)));
  const b = writeBatch(getDb());
  unread.docs.forEach((x) => b.update(x.ref, { is_read: true }));
  await b.commit();
}

export async function loadGoals() {
  const u = me();
  const [g, d, w] = await Promise.all([
    getDocs(query(sub(u.uid, "goals"), where("status", "==", "active"))),
    getDocs(query(collection(getDb(), "deposits"), where("user_id", "==", u.uid), limit(10))),
    getDocs(query(collection(getDb(), "withdrawals"), where("user_id", "==", u.uid), limit(10))),
  ]);
  return {
    goals: g.docs.map((x) => ({ id: x.id, title: String(x.get("title")), target_amount: Number(x.get("target_amount")), saved_amount: Number(x.get("saved_amount") ?? 0) })),
    deposits: d.docs.map((x) => ({ id: x.id, amount: Number(x.get("amount")), status: String(x.get("status")), created_at: iso(x.get("created_at")) })),
    withdrawals: w.docs.map((x) => ({ id: x.id, amount: Number(x.get("amount")), upi_id: String(x.get("upi_id")), status: String(x.get("status")), created_at: iso(x.get("created_at")) })),
  };
}

export async function requestDeposit({ data }: { data: { amount: number; utr: string; purpose: "deposit" | "vip" } }) {
  const u = me();
  if (!/^\d{12}$/.test(data.utr)) throw new Error("UTR must be exactly 12 digits");
  const dup = await getDocs(query(collection(getDb(), "deposits"), where("txn_id", "==", data.utr), limit(1)));
  if (!dup.empty) throw new Error("This UTR was already submitted");
  await addDoc(collection(getDb(), "deposits"), { user_id: u.uid, email: u.email ?? "", amount: data.amount, payment_source: "UPI", purpose: data.purpose, txn_id: data.utr, status: "pending", created_at: serverTimestamp() });
}

export async function requestWithdrawal({ data }: { data: { amount: number; upi: string } }) {
  const u = me();
  if (data.amount < 10) throw new Error("Minimum withdrawal is ₹10");
  await runTransaction(getDb(), async (t) => {
    const s = await t.get(userRef(u.uid));
    if (Number(s.get("withdrawableBalance") ?? 0) < data.amount) throw new Error("Not enough Smart Money");
    t.update(userRef(u.uid), { withdrawableBalance: increment(-data.amount), defaultUpi: data.upi });
    t.set(doc(collection(getDb(), "withdrawals")), { user_id: u.uid, email: u.email ?? "", amount: data.amount, upi_id: data.upi, status: "pending", created_at: serverTimestamp() });
    addTx(t, u.uid, "withdrawal", -data.amount, 0, `Withdrawal to ${data.upi}`);
    addNote(t, u.uid, "Withdrawal submitted", `₹${data.amount} to ${data.upi} is being processed (24–48h).`);
  });
}

export async function convertCoins() {
  const u = me();
  return runTransaction(getDb(), async (t) => {
    const coins = Number((await t.get(userRef(u.uid))).get("coins") ?? 0);
    const usable = Math.floor(coins / 100) * 100;
    if (usable < 100) throw new Error("You need at least 100 coins");
    const money = usable / 100;
    t.update(userRef(u.uid), { coins: increment(-usable), withdrawableBalance: increment(money) });
    addTx(t, u.uid, "convert", money, -usable, "Coins redeemed");
    return { money };
  });
}

export async function createGoal({ data }: { data: { title: string; target: number } }) {
  const u = me();
  const active = await getDocs(query(sub(u.uid, "goals"), where("status", "==", "active")));
  if (active.size >= 5) throw new Error("You can have up to 5 active goals");
  await addDoc(sub(u.uid, "goals"), { title: data.title.trim().slice(0, 60), target_amount: data.target, saved_amount: 0, status: "active", created_at: serverTimestamp() });
}

export async function fundGoal({ data }: { data: { goal: string; amount: number } }) {
  const u = me();
  await runTransaction(getDb(), async (t) => {
    const g = doc(sub(u.uid, "goals"), data.goal);
    const s = await t.get(userRef(u.uid));
    if (Number(s.get("withdrawableBalance") ?? 0) < data.amount) throw new Error("Not enough Smart Money");
    t.update(userRef(u.uid), { withdrawableBalance: increment(-data.amount) });
    t.update(g, { saved_amount: increment(data.amount) });
    addTx(t, u.uid, "goal", -data.amount, 0, "Added to savings goal");
  });
}

export async function breakGoal({ data }: { data: { goal: string } }) {
  const u = me();
  return runTransaction(getDb(), async (t) => {
    const g = doc(sub(u.uid, "goals"), data.goal);
    const [gs, us] = await Promise.all([t.get(g), t.get(userRef(u.uid))]);
    const saved = Number(gs.get("saved_amount") ?? 0);
    const penalty = us.get("isVIP") ? 0 : Math.min(10, saved);
    t.update(g, { status: "broken" });
    t.update(userRef(u.uid), { withdrawableBalance: increment(saved - penalty) });
    addTx(t, u.uid, "refund", saved - penalty, 0, "Savings goal broken");
    return { penalty };
  });
}

export async function submitTicket(input: { issue_type: string; message: string }) {
  const u = me();
  await addDoc(collection(getDb(), "support_tickets"), { user_id: u.uid, email: u.email ?? "", issue_type: input.issue_type, message: input.message.trim().slice(0, 1000), status: "open", created_at: serverTimestamp() });
}

export async function checkAdmin() {
  const { ADMIN_EMAIL } = await import("@/lib/firebase");
  const u = getFirebaseAuth().currentUser;
  return { isAdmin: (u?.email ?? "").toLowerCase() === ADMIN_EMAIL };
}

export { pushLocal, setDoc };

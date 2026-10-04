import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { Copy, LoaderCircle, Target, Plus, Share2, Users, Coins, Crown, Trophy } from "lucide-react";

import { toast } from "@/components/ui/app-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { breakGoal, convertCoins, createGoal, fundGoal, loadGoals, loadWeeklyReferrers, redeemReferral, requestDeposit, requestWithdrawal } from "@/lib/wallet.functions";

const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const errMsg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);
const VPA = "smartsaver@upi";
const dialogCls = "w-[calc(100%-2rem)] rounded-2xl border-border bg-card";

/* ---------- UPI pay step (shared) ---------- */
function UpiPayStep({ amount, purpose, onBack, onSubmitted }: { amount: number; purpose: "deposit" | "vip"; onBack: () => void; onSubmitted: () => Promise<void> }) {
  const submit = useServerFn(requestDeposit);
  const [utr, setUtr] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const validUtr = /^\d{12}$/.test(utr);
  const upiLink = `upi://pay?pa=${VPA}&pn=${encodeURIComponent("Smart Saver")}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(purpose === "vip" ? "VIP Pass" : "Smart Money")}`;
  const go = async (e: FormEvent) => {
    e.preventDefault(); setTouched(true);
    if (!validUtr) return;
    setBusy(true);
    try { await submit({ data: { amount, utr, purpose } }); toast.success("Payment submitted", { description: "It will be activated after verification." }); setUtr(""); await onSubmitted(); }
    catch (err) { toast.error(errMsg(err, "Could not submit payment")); } finally { setBusy(false); }
  };
  return <form onSubmit={go} className="space-y-4">
    <p className="text-center text-sm">Pay <b className="text-primary">₹{money.format(amount)}</b> to the official UPI ID</p>
    <div className="mx-auto grid w-fit place-items-center rounded-xl bg-foreground p-3"><QRCodeSVG value={upiLink} size={176}/></div>
    <div className="flex items-center justify-between rounded-xl border border-dashed border-primary bg-background/40 p-3">
      <div><p className="text-[11px] text-muted-foreground">Official UPI ID</p><p className="font-mono font-bold text-primary">{VPA}</p></div>
      <Button type="button" size="sm" variant="walletOutline" onClick={async () => { await navigator.clipboard.writeText(VPA); toast.success("UPI ID copied"); }}><Copy/>Copy</Button>
    </div>
    <div><label className="mb-1.5 block text-sm font-semibold" htmlFor={`utr-${purpose}`}>12-digit UTR / Reference number</label>
      <Input id={`utr-${purpose}`} inputMode="numeric" maxLength={12} placeholder="Enter UTR after paying" value={utr} onChange={(e) => setUtr(e.target.value.replace(/\D/g, ""))} className="h-11 font-mono tracking-widest"/>
      {touched && !validUtr && <p className="mt-1 text-xs text-destructive">UTR must be exactly 12 digits</p>}</div>
    <div className="grid grid-cols-[auto_1fr] gap-2"><Button type="button" variant="outline" className="h-12" onClick={onBack}>Back</Button>
      <Button type="submit" variant="wallet" size="wallet" disabled={busy}>{busy && <LoaderCircle className="animate-spin"/>}Submit for verification</Button></div>
  </form>;
}

/* ---------- UPI deposit ---------- */
export function DepositDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => Promise<void> }) {
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const amt = Number(amount);
  const validAmt = Number.isFinite(amt) && amt >= 10 && amt <= 100000 && /^\d+(\.\d{1,2})?$/.test(amount);
  const change = (o: boolean) => { if (!o) { setStep(1); } onOpenChange(o); };
  return <Dialog open={open} onOpenChange={change}><DialogContent className={`${dialogCls} max-h-[90vh] overflow-y-auto`}>
    <DialogHeader><DialogTitle>Add Smart Money</DialogTitle><DialogDescription>{step === 1 ? "₹1 = ₹1.00 Smart Money. Minimum ₹10." : "Step 2 of 2 · Pay and enter your UTR"}</DialogDescription></DialogHeader>
    {step === 1 ? <form onSubmit={(e) => { e.preventDefault(); if (!validAmt) return toast.error("Enter an amount from ₹10 to ₹1,00,000"); setStep(2); }} className="space-y-4">
      <div className="relative"><span className="absolute left-3 top-2.5 font-bold text-primary">₹</span><Input autoFocus inputMode="decimal" placeholder="100" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 pl-8"/></div>
      {validAmt && <p className="text-xs text-muted-foreground">You'll receive <b className="text-primary">₹{money.format(amt)}</b> Smart Money after verification.</p>}
      <Button type="submit" variant="wallet" size="wallet" className="w-full" disabled={!validAmt}>Continue to payment</Button>
    </form> : <UpiPayStep amount={amt} purpose="deposit" onBack={() => setStep(1)} onSubmitted={async () => { setAmount(""); change(false); await onDone(); }}/>}
  </DialogContent></Dialog>;
}

/* ---------- VIP pass ---------- */
const VIP_ROWS: [string, string, string][] = [
  ["Spin Rewards", "1x coins", "2x DOUBLE coins every spin"],
  ["Ad Rewards", "1x coins", "2x DOUBLE coins per ad"],
  ["Daily Ads Limit", "20 ads/day", "50 ads/day"],
  ["Goal Break Penalty", "₹10 penalty", "₹0 — break unlimited goals, full refund all month"],
  ["Badge", "Standard profile", "Exclusive Gold Crown"],
];
export function VipDialog({ open, onOpenChange, balance, onPayWallet, busy, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; balance: number; onPayWallet: () => void; busy: boolean; onDone: () => Promise<void> }) {
  const [upi, setUpi] = useState(false);
  const change = (o: boolean) => { if (!o) setUpi(false); onOpenChange(o); };
  return <Dialog open={open} onOpenChange={change}><DialogContent className={`${dialogCls} max-h-[90vh] overflow-y-auto border-primary`}>
    <Crown className="mx-auto size-12 fill-current text-primary"/>
    <DialogHeader><DialogTitle className="text-center">VIP Pass</DialogTitle><DialogDescription className="text-center"><span className="font-display text-3xl font-bold text-primary">₹49</span> <span className="text-xs">/ month</span></DialogDescription></DialogHeader>
    {!upi ? <>
      <div className="overflow-hidden rounded-xl border border-border text-xs">
        <div className="grid grid-cols-[1fr_1fr_1.3fr] bg-muted/60 font-bold"><span className="p-2">Feature</span><span className="p-2">Free</span><span className="p-2 text-primary">VIP</span></div>
        {VIP_ROWS.map(([f, a, b]) => <div key={f} className="grid grid-cols-[1fr_1fr_1.3fr] border-t border-border"><span className="p-2 font-semibold">{f}</span><span className="p-2 text-muted-foreground">{a}</span><span className="p-2 font-semibold text-primary">{b}</span></div>)}
      </div>
      <div className="space-y-2">
        <Button variant="wallet" size="wallet" className="w-full" disabled={busy || balance < 49} onClick={onPayWallet}>{busy && <LoaderCircle className="animate-spin"/>}Pay via Smart Money Wallet</Button>
        <p className="text-center text-xs text-muted-foreground">Wallet balance: ₹{money.format(balance)}{balance < 49 ? " · need ₹49" : ""}</p>
        <Button variant="walletOutline" size="wallet" className="w-full" onClick={() => setUpi(true)}>Pay via UPI</Button>
      </div>
    </> : <UpiPayStep amount={49} purpose="vip" onBack={() => setUpi(false)} onSubmitted={async () => { change(false); await onDone(); }}/>}
  </DialogContent></Dialog>;
}

/* ---------- Withdraw ---------- */
export function WithdrawDialog({ open, onOpenChange, balance, defaultUpi, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; balance: number; defaultUpi: string | null; onDone: () => Promise<void> }) {
  const submit = useServerFn(requestWithdrawal);
  const [amount, setAmount] = useState("");
  const [upi, setUpi] = useState(defaultUpi ?? "");
  const [busy, setBusy] = useState(false);
  const amt = Number(amount);
  const go = async (e: FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(amt) || amt < 10) return toast.error("Minimum withdrawal is ₹10");
    if (amt > balance) return toast.error("Insufficient Smart Money");
    if (!/^[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}$/.test(upi.trim())) return toast.error("Enter a valid UPI ID");
    setBusy(true);
    try { await submit({ data: { amount: amt, upi: upi.trim() } }); toast.success("Withdrawal requested", { description: "Amount is held until the payout is sent." }); setAmount(""); onOpenChange(false); await onDone(); }
    catch (err) { toast.error(errMsg(err, "Could not request withdrawal")); } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className={dialogCls}>
    <DialogHeader><DialogTitle>Withdraw to UPI</DialogTitle><DialogDescription>Available: ₹{money.format(balance)} · Minimum ₹10</DialogDescription></DialogHeader>
    <form onSubmit={go} className="space-y-4">
      <div className="relative"><span className="absolute left-3 top-2.5 font-bold text-primary">₹</span><Input inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 pl-8"/></div>
      <Input placeholder="yourname@upi" value={upi} onChange={(e) => setUpi(e.target.value)} maxLength={60} className="h-11"/>
      <Button type="submit" variant="wallet" size="wallet" className="w-full" disabled={busy || balance < 10}>{busy && <LoaderCircle className="animate-spin"/>}{balance < 10 ? "Need at least ₹10" : "Request Withdrawal"}</Button>
    </form>
  </DialogContent></Dialog>;
}

/* ---------- Redeem coins ---------- */
export function RedeemDialog({ open, onOpenChange, coins, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; coins: number; onDone: () => Promise<void> }) {
  const convert = useServerFn(convertCoins);
  const [busy, setBusy] = useState(false);
  const usable = Math.floor(coins / 100) * 100;
  const go = async () => {
    setBusy(true);
    try { const r = await convert(); toast.success(`₹${money.format(r.money)} added to Smart Money`); onOpenChange(false); await onDone(); }
    catch (err) { toast.error(errMsg(err, "Could not redeem")); } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className={`${dialogCls} text-center`}>
    <Coins className="mx-auto size-12 text-primary"/>
    <DialogHeader><DialogTitle className="text-center">Redeem to Smart Money</DialogTitle><DialogDescription className="text-center">100 Smart Coins = ₹1 · Minimum 100 coins</DialogDescription></DialogHeader>
    <div className="rounded-xl bg-muted/40 p-4 text-sm"><p>You have <b className="text-primary">{coins.toLocaleString("en-IN")}</b> coins</p><p className="mt-1">Redeem <b>{usable.toLocaleString("en-IN")}</b> coins → <b className="text-primary">₹{money.format(usable / 100)}</b></p></div>
    <Button variant="wallet" size="wallet" onClick={go} disabled={busy || usable < 100}>{busy && <LoaderCircle className="animate-spin"/>}{usable < 100 ? `Need ${100 - coins} more coins` : "Redeem Now"}</Button>
  </DialogContent></Dialog>;
}

/* ---------- Savings goals ---------- */
type GoalData = Awaited<ReturnType<typeof loadGoals>>;
export function SavingsGoals({ isVip, balance, onChange, version }: { isVip: boolean; balance: number; onChange: () => Promise<void>; version: number }) {
  const getGoals = useServerFn(loadGoals);
  const doCreate = useServerFn(createGoal);
  const doFund = useServerFn(fundGoal);
  const doBreak = useServerFn(breakGoal);
  const [data, setData] = useState<GoalData | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState(""); const [target, setTarget] = useState(""); const [agree, setAgree] = useState(false);
  const [fundId, setFundId] = useState<string | null>(null); const [fundAmt, setFundAmt] = useState("");
  const [breakId, setBreakId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = () => getGoals().then(setData).catch(() => undefined);
  useEffect(() => { reload(); }, [version]);
  const goals = data?.goals ?? [];

  const act = async (fn: () => Promise<unknown>, ok: string, close: () => void) => {
    setBusy(true);
    try { await fn(); toast.success(ok); close(); await Promise.all([reload(), onChange()]); }
    catch (e) { toast.error(errMsg(e, "Something went wrong")); } finally { setBusy(false); }
  };

  return <section className="mt-6">
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex min-w-0 items-center gap-2 text-xl font-extrabold sm:text-2xl"><Target className="size-6 shrink-0 text-primary"/>My Savings Goals</h2>
      <span className="text-xs text-muted-foreground">{goals.length}/5</span>
    </div>
    <div className="space-y-3">
      {goals.length === 0 && <div className="rounded-lg border border-dashed border-primary/50 bg-card/60 p-5 text-center text-sm text-muted-foreground">Start saving for something you love. Fund goals from your Smart Money.</div>}
      {goals.map((g) => { const pct = Math.min(100, (g.saved_amount / g.target_amount) * 100); return <div key={g.id} className="rounded-lg border border-border bg-card/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{g.title}</p><p className="text-sm font-bold text-primary">₹{money.format(g.saved_amount)} <span className="text-muted-foreground">/ ₹{money.format(g.target_amount)}</span></p></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }}/></div>
        <div className="mt-3 grid grid-cols-2 gap-2"><Button size="sm" variant="wallet" onClick={() => { setFundId(g.id); setFundAmt(""); }}><Plus/>Add money</Button><Button size="sm" variant="outline" onClick={() => setBreakId(g.id)}>Break goal</Button></div>
      </div>; })}
      {goals.length < 5 && <Button variant="walletOutline" size="wallet" className="w-full" onClick={() => { setTitle(""); setTarget(""); setAgree(false); setCreateOpen(true); }}><Plus/>Create a goal</Button>}
    </div>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className={dialogCls}>
      <DialogHeader><DialogTitle>New Savings Goal</DialogTitle><DialogDescription>Up to 5 active goals.</DialogDescription></DialogHeader>
      <Input placeholder="Goal name (e.g. New phone)" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} className="h-11"/>
      <div className="relative"><span className="absolute left-3 top-2.5 font-bold text-primary">₹</span><Input inputMode="decimal" placeholder="Target amount" value={target} onChange={(e) => setTarget(e.target.value)} className="h-11 pl-8"/></div>
      <label className="flex items-start gap-2 text-xs text-muted-foreground"><Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5"/>
        <span>I agree that breaking this goal early costs ₹10 Smart Money{isVip ? " (waived for VIP)" : ""}.</span></label>
      <Button variant="wallet" size="wallet" disabled={busy || !agree || !title.trim() || !(Number(target) > 0)} onClick={() => act(() => doCreate({ data: { title: title.trim(), target: Number(target) } }), "Goal created", () => setCreateOpen(false))}>{busy && <LoaderCircle className="animate-spin"/>}Create Goal</Button>
    </DialogContent></Dialog>

    <Dialog open={fundId !== null} onOpenChange={(o) => !o && setFundId(null)}><DialogContent className={dialogCls}>
      <DialogHeader><DialogTitle>Add to goal</DialogTitle><DialogDescription>From Smart Money · ₹{money.format(balance)} available</DialogDescription></DialogHeader>
      <div className="relative"><span className="absolute left-3 top-2.5 font-bold text-primary">₹</span><Input inputMode="decimal" placeholder="Amount" value={fundAmt} onChange={(e) => setFundAmt(e.target.value)} className="h-11 pl-8"/></div>
      <Button variant="wallet" size="wallet" disabled={busy || !(Number(fundAmt) > 0)} onClick={() => fundId && act(() => doFund({ data: { goal: fundId, amount: Number(fundAmt) } }), "Money added to goal", () => setFundId(null))}>{busy && <LoaderCircle className="animate-spin"/>}Add</Button>
    </DialogContent></Dialog>

    <Dialog open={breakId !== null} onOpenChange={(o) => !o && setBreakId(null)}><DialogContent className={dialogCls}>
      <DialogHeader><DialogTitle>Break this goal?</DialogTitle><DialogDescription>{isVip ? <span className="inline-flex items-center gap-1"><Crown className="size-4 text-primary"/>VIP: no penalty. Saved money returns to Smart Money.</span> : "Saved money returns to Smart Money minus a ₹10 penalty."}</DialogDescription></DialogHeader>
      <Button variant="destructive" size="wallet" disabled={busy} onClick={() => breakId && act(() => doBreak({ data: { goal: breakId } }), "Goal closed", () => setBreakId(null))}>{busy && <LoaderCircle className="animate-spin"/>}Break Goal</Button>
    </DialogContent></Dialog>
  </section>;
}

/* ---------- Refer & earn ---------- */
export function ReferSection({ code: myCode, referredBy, onDone }: { code: string; referredBy: string | null; onDone: () => Promise<void> }) {
  const doRedeem = useServerFn(redeemReferral);
  const getLeaders = useServerFn(loadWeeklyReferrers);
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false);
  const [leaders, setLeaders] = useState<Awaited<ReturnType<typeof loadWeeklyReferrers>>>([]);
  useEffect(() => { getLeaders().then(setLeaders).catch(() => undefined); }, []);
  const shareText = `Join me on Smart Saver and earn coins daily! Use my referral code ${myCode}: ${typeof window !== "undefined" ? window.location.origin : ""}`;
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: "Smart Saver", text: shareText }); else { await navigator.clipboard.writeText(shareText); toast.success("Invite link copied"); } } catch { /* cancelled */ }
  };
  const redeem = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await doRedeem({ data: { code } }); setCode(""); await onDone(); toast.success("Referral code applied"); }
    catch (err) { toast.error(errMsg(err, "Could not apply code")); } finally { setBusy(false); }
  };
  const whatsapp = () => window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
  return <div className="mt-10 text-left">
    <h2 className="mb-3 flex items-center gap-2 font-display text-2xl font-bold text-gold-soft"><Users className="size-6 text-primary"/>Refer & Earn</h2>
    <div className="rounded-lg border border-primary/50 bg-card p-4 shadow-[var(--shadow-gold)]">
      <p className="text-sm text-foreground/80">Earn <span className="font-bold text-primary">+1,000 coins</span> when a friend joins with your code.</p>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-primary bg-background/40 p-3">
        <span className="font-mono text-2xl font-bold tracking-widest text-primary">{myCode}</span>
        <Button variant="ghost" size="icon" aria-label="Copy referral code" onClick={async () => { await navigator.clipboard.writeText(myCode); toast.success("Code copied"); }} className="text-primary"><Copy className="size-5"/></Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2"><Button variant="wallet" size="wallet" onClick={whatsapp}><Share2/>WhatsApp</Button><Button variant="walletOutline" size="wallet" onClick={share}><Share2/>Share</Button></div>
      {!referredBy && <form onSubmit={redeem} className="mt-4 flex gap-2">
        <Input placeholder="Have a friend's code?" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} className="h-11"/>
        <Button type="submit" variant="walletOutline" className="h-11" disabled={busy || code.trim().length < 4}>{busy ? <LoaderCircle className="animate-spin"/> : "Apply"}</Button>
      </form>}
      <div className="mt-4 rounded-md border border-primary/30 bg-background/45 p-3">
        <div className="flex items-center justify-between"><p className="flex items-center gap-2 text-xs font-bold uppercase text-primary"><Trophy className="size-4"/>Weekly top referrers</p><span className="text-[10px] text-muted-foreground">Last 7 days</span></div>
        {leaders.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Be the first name on this week’s leaderboard.</p> : <ol className="mt-2 space-y-1.5">{leaders.map((leader, index) => <li key={`${leader.label}-${index}`} className="flex items-center justify-between text-sm"><span><b className="mr-2 text-primary">#{index + 1}</b>{leader.label}</span><span className="font-semibold">{leader.referrals} referral{leader.referrals === 1 ? "" : "s"}</span></li>)}</ol>}
      </div>
    </div>
  </div>;
}

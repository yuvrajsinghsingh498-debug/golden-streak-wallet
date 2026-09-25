import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Bell, Crown, WalletCards, Landmark, Plus, ChevronRight, Flame, PlaySquare,
  Users, ReceiptText, Home, BadgeIndianRupee, History, UserRound, Gift, Coins,
  LogOut, LoaderCircle, Trophy, Check, Copy, Share2, HelpCircle, Zap, Sparkles, ArrowDownLeft, ArrowUpRight,
} from "lucide-react";
import { toast } from "@/components/ui/app-toast";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import {
  addMoney, buyVip, claimReward, loadWallet, markNotificationsRead, redeemReferral, spinWheel, unlockSpinAd, watchAd,
} from "@/lib/wallet.functions";

type WalletData = Awaited<ReturnType<typeof loadWallet>>;
type Tab = "home" | "earn" | "spin" | "history" | "account";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Smart Wallet — Money, Coins & Daily Rewards" },
    { name: "description", content: "Manage your withdrawable balance, earn coins, spin daily, grow streaks, and review wallet activity." },
    { property: "og:title", content: "Smart Wallet — Money, Coins & Daily Rewards" },
    { property: "og:description", content: "Your secure mobile wallet for balances, coins, spins, streaks, and rewards." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: SmartWalletPage,
});

const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rewards = { 100: 1000, 200: 2020, 500: 6000 } as const;
const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

function SmartWalletPage() {
  const router = useRouter();
  const getWallet = useServerFn(loadWallet);
  const saveMoney = useServerFn(addMoney);
  const saveReward = useServerFn(claimReward);
  const purchaseVip = useServerFn(buyVip);
  const readAll = useServerFn(markNotificationsRead);
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [addOpen, setAddOpen] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [rewardMilestone, setRewardMilestone] = useState<100 | 200 | 500 | null>(null);

  const refresh = async () => {
    const result = await getWallet();
    setWalletData(result);
    const pending = result.wallet.pending_milestone;
    if (pending === 100 || pending === 200 || pending === 500) setRewardMilestone(pending);
  };

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const hasSession = Boolean(data.session);
      setSignedIn(hasSession);
      setSessionReady(true);
      if (hasSession) refresh().catch(() => toast.error("Could not load your wallet"));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setSignedIn(Boolean(session));
      router.invalidate();
      if (session) refresh().catch(() => toast.error("Could not load your wallet"));
      else setWalletData(null);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  if (!sessionReady) return <LoadingScreen />;
  if (!signedIn) return <AuthScreen />;
  if (!walletData) return <LoadingScreen />;

  const wallet = walletData.wallet;
  const unread = walletData.notifications.filter((n) => !n.is_read).length;

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 1_000_000 || !/^\d+(\.\d{1,2})?$/.test(amount)) {
      toast.error("Enter an amount from ₹1 to ₹10,00,000"); return;
    }
    setSaving(true);
    try {
      await saveMoney({ data: { amount: numericAmount } });
      await refresh(); setAddOpen(false); setAmount("");
      toast.success(`₹${money.format(numericAmount)} added`, { description: `You also earned ${Math.round(numericAmount * 10).toLocaleString("en-IN")} coins.` });
    } catch (error) { toast.error(errMsg(error, "Could not add money")); }
    finally { setSaving(false); }
  };

  const handleClaim = async () => {
    if (!rewardMilestone) return;
    setSaving(true);
    try {
      const result = await saveReward({ data: { milestone: rewardMilestone } });
      toast.success(`${result?.awarded?.toLocaleString("en-IN")} coins claimed`);
      setRewardMilestone(null); await refresh();
    } catch (error) { toast.error(errMsg(error, "Could not claim reward")); }
    finally { setSaving(false); }
  };

  const handleVip = async () => {
    setSaving(true);
    try {
      await purchaseVip();
      await refresh(); setVipOpen(false);
      toast.success("VIP activated!", { description: "₹49 was deducted from your balance." });
    } catch (error) { toast.error(errMsg(error, "Could not activate VIP")); }
    finally { setSaving(false); }
  };

  const openNotifications = async (open: boolean) => {
    setNotifOpen(open);
    if (open && unread > 0) { try { await readAll(); await refresh(); } catch { /* ignore */ } }
  };

  const onVipClick = () => { if (wallet.is_vip) toast.info("You're a VIP member"); else setVipOpen(true); };

  return (
    <main className="wallet-shell min-h-screen pb-28">
      <div className="mx-auto w-full max-w-[480px] px-4">
        <header className="flex h-20 items-center justify-between border-b border-primary/45">
          <h1 className="font-display text-3xl font-bold text-primary">Smart Wallet</h1>
          <div className="flex items-center gap-4">
            <button aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative text-primary" onClick={() => openNotifications(true)}>
              <Bell className="size-7 fill-current"/>
              {unread > 0 && <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">{unread > 9 ? "9+" : unread}</span>}
            </button>
            <VipBadge isVip={wallet.is_vip} onClick={onVipClick}/>
          </div>
        </header>

        {activeTab === "home" && <>
          <section className="money-card relative mt-5 overflow-hidden rounded-3xl border border-wallet-cyan p-5 shadow-2xl">
            <WalletCards className="absolute -right-5 top-7 size-36 rotate-[-12deg] text-foreground/15" strokeWidth={1.5}/>
            <div className="relative flex items-start gap-4"><div className="grid size-14 place-items-center rounded-2xl bg-foreground/15"><WalletCards className="size-9"/></div><div><h2 className="text-xl font-extrabold">SMART MONEY</h2><p className="text-sm text-foreground/75">Withdrawable Balance</p></div></div>
            <div className="relative mt-5 text-4xl font-extrabold">₹ {money.format(wallet.balance)}</div>
            <div className="relative mt-6 grid grid-cols-2 gap-3">
              <Button variant="walletOutline" size="wallet" onClick={() => toast.info(wallet.is_vip ? "Priority withdrawals are coming soon" : "Withdrawals are coming soon")}><Landmark/>Withdraw<ChevronRight/></Button>
              <Button variant="wallet" size="wallet" onClick={() => setAddOpen(true)}><Plus className="rounded-full bg-primary-foreground p-0.5 text-primary"/>Add Money<ChevronRight/></Button>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-border bg-card/80 p-4 shadow-xl">
            <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase text-primary">Daily Streak Reward</p><h2 className="mt-1 flex items-center gap-2 text-xl font-extrabold"><Flame className="size-6 fill-current text-primary"/>{wallet.current_streak} Days Active</h2></div><div className="text-right"><p className="text-xs text-muted-foreground">Coin balance</p><p className="font-bold text-primary"><Coins className="mr-1 inline size-4"/>{wallet.coins.toLocaleString("en-IN")}</p></div></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, wallet.current_streak / 5)}%` }}/></div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {([100,200,500] as const).map((day) => <div key={day} className={`rounded-lg border p-2 text-center ${wallet.current_streak >= day ? "border-primary bg-primary/10" : "border-border bg-muted/40"}`}><Trophy className="mx-auto mb-1 size-4 text-primary"/><p className="text-xs font-bold">{day} Streak</p><p className="mt-0.5 text-[11px] text-primary">+{rewards[day].toLocaleString("en-IN")} Coins</p></div>)}
            </div>
          </section>

          <SectionTitle icon={<Flame className="size-7 fill-current text-primary"/>}>Quick Earn</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <EarnCard className="earn-video border-wallet-violet" icon={<PlaySquare/>} title="Watch Video Ads" reward="+10 Coins" onClick={() => setActiveTab("earn")}/>
            <EarnCard className="earn-refer border-wallet-green" icon={<Users/>} title="Refer & Earn" reward="+1,000 Coins" onClick={() => setActiveTab("earn")}/>
          </div>

          <SectionTitle>Wallet Overview</SectionTitle>
          <OverviewRow icon={<WalletCards/>} label="Available Balance" value={`₹ ${money.format(wallet.balance)}`} onClick={() => setAddOpen(true)}/>
          <OverviewRow icon={<ReceiptText/>} label={walletData.transactions.length ? `${walletData.transactions.length} recent transactions` : "Your transactions will appear here."} onClick={() => setActiveTab("history")}/>
        </>}

        {activeTab === "earn" && <EarnTab data={walletData} refresh={refresh}/>}
        {activeTab === "spin" && <SpinTab data={walletData} refresh={refresh}/>}
        {activeTab === "history" && <Transactions data={walletData.transactions}/>}
        {activeTab === "account" && <AccountTab data={walletData} onVip={onVipClick} onSignOut={async () => { await supabase.auth.signOut(); setActiveTab("home"); }}/>}
      </div>

      <BottomNav active={activeTab} setActive={setActiveTab}/>

      <Sheet open={notifOpen} onOpenChange={openNotifications}>
        <SheetContent side="right" className="w-[88%] max-w-sm border-border bg-card">
          <SheetHeader><SheetTitle>Notifications</SheetTitle><SheetDescription>Your latest wallet updates</SheetDescription></SheetHeader>
          <div className="mt-4 space-y-3 overflow-y-auto">
            {walletData.notifications.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No notifications yet.</p> :
              walletData.notifications.map((n) => <div key={n.id} className="rounded-xl border border-border bg-muted/30 p-3"><p className="text-sm font-bold">{n.title}</p><p className="mt-1 text-xs text-muted-foreground">{n.body}</p><p className="mt-2 text-[11px] text-muted-foreground">{formatTime(n.created_at)}</p></div>)}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent className="w-[calc(100%-2rem)] rounded-2xl border-border bg-card"><DialogHeader><DialogTitle>Add Money</DialogTitle><DialogDescription>Every ₹1 adds 10 coins to your wallet.</DialogDescription></DialogHeader><form onSubmit={handleAdd}><label className="mb-2 block text-sm font-semibold" htmlFor="amount">Amount</label><div className="relative"><span className="absolute left-3 top-2.5 font-bold text-primary">₹</span><Input id="amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-11 pl-8" autoFocus/></div><p className="mt-2 text-xs text-muted-foreground">You’ll receive {Math.round((Number(amount) || 0) * 10).toLocaleString("en-IN")} coins.</p><DialogFooter className="mt-5"><Button type="submit" variant="wallet" size="wallet" disabled={saving} className="w-full">{saving && <LoaderCircle className="animate-spin"/>}Confirm & Add</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={vipOpen} onOpenChange={setVipOpen}>
        <DialogContent className="w-[calc(100%-2rem)] rounded-2xl border-primary bg-card">
          <Crown className="mx-auto size-14 fill-current text-primary"/>
          <DialogHeader><DialogTitle className="text-center">Buy VIP Membership</DialogTitle><DialogDescription className="text-center"><span className="font-display text-3xl font-bold text-primary">₹49</span> <span className="text-xs">/ month</span></DialogDescription></DialogHeader>
          <ul className="space-y-2 text-sm">
            {["Exclusive VIP Badge", "Priority Withdrawals", "Bonus Daily Spin"].map((perk) => <li key={perk} className="flex items-center gap-2 rounded-lg bg-muted/40 p-2.5"><Check className="size-4 text-primary"/>{perk}</li>)}
          </ul>
          <p className="text-center text-xs text-muted-foreground">Paid from your wallet balance (₹{money.format(wallet.balance)} available).</p>
          <Button variant="wallet" size="wallet" onClick={handleVip} disabled={saving}>{saving && <LoaderCircle className="animate-spin"/>}Pay ₹49 & Activate VIP</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={rewardMilestone !== null} onOpenChange={() => undefined}><DialogContent className="w-[calc(100%-2rem)] rounded-2xl border-primary bg-card text-center"><Trophy className="mx-auto size-14 text-primary"/><DialogHeader><DialogTitle>Streak milestone reached!</DialogTitle><DialogDescription>You completed {rewardMilestone} active days. Claim your {rewardMilestone ? rewards[rewardMilestone].toLocaleString("en-IN") : 0} coin reward.</DialogDescription></DialogHeader><Button variant="wallet" size="wallet" onClick={handleClaim} disabled={saving}>{saving && <LoaderCircle className="animate-spin"/>}Claim Reward</Button></DialogContent></Dialog>
    </main>
  );
}

function VipBadge({ isVip, onClick }: { isVip: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 font-extrabold ${isVip ? "border-primary bg-primary/15 text-primary shadow-[0_0_18px] shadow-primary/40" : "border-muted-foreground/50 text-muted-foreground"}`}>
    <Crown className={`size-5 ${isVip ? "fill-current" : ""}`}/>{isVip ? "VIP" : "Get VIP"}
  </button>;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/* ---------------- Simulated ad ---------------- */
function AdDialog({ open, onDone, onCancel, title }: { open: boolean; onDone: () => void; onCancel: () => void; title: string }) {
  const [progress, setProgress] = useState(0);
  const doneRef = useRef(false);
  useEffect(() => {
    if (!open) { setProgress(0); doneRef.current = false; return; }
    const start = Date.now();
    const id = window.setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / 5000) * 100);
      setProgress(p);
      if (p >= 100 && !doneRef.current) { doneRef.current = true; window.clearInterval(id); onDone(); }
    }, 100);
    return () => window.clearInterval(id);
  }, [open]);
  return <Dialog open={open} onOpenChange={(o) => { if (!o && progress < 100) onCancel(); }}>
    <DialogContent className="w-[calc(100%-2rem)] rounded-2xl border-wallet-violet bg-card">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Please watch the full video to receive your reward.</DialogDescription></DialogHeader>
      <div className="earn-video grid aspect-video place-items-center rounded-xl border border-wallet-violet"><div className="text-center"><PlaySquare className="mx-auto size-12 animate-pulse"/><p className="mt-2 text-sm font-bold">Sponsored video</p><p className="text-xs text-foreground/70">{Math.ceil(5 - progress / 20)}s remaining</p></div></div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }}/></div>
    </DialogContent>
  </Dialog>;
}

/* ---------------- Earn tab ---------------- */
function EarnTab({ data, refresh }: { data: WalletData; refresh: () => Promise<void> }) {
  const doWatch = useServerFn(watchAd);
  const doRedeem = useServerFn(redeemReferral);
  const [adOpen, setAdOpen] = useState(false);
  const [tip, setTip] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const myCode = data.wallet.referral_code;
  const shareText = `Join me on Smart Wallet and earn coins daily! Use my referral code ${myCode}: ${typeof window !== "undefined" ? window.location.origin : ""}`;

  const finishAd = async () => {
    try { await doWatch(); await refresh(); toast.success("+10 coins earned!"); }
    catch (e) { toast.error(errMsg(e, "Could not credit ad reward")); }
    finally { setAdOpen(false); }
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Smart Wallet", text: shareText });
      else { await navigator.clipboard.writeText(shareText); toast.success("Invite link copied"); }
    } catch { /* user cancelled */ }
  };
  const redeem = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await doRedeem({ data: { code } }); setCode(""); await refresh(); toast.success("Referral code applied"); }
    catch (err) { toast.error(errMsg(err, "Could not apply code")); }
    finally { setBusy(false); }
  };

  return <section className="pt-6">
    <div className="rounded-2xl border border-primary/50 bg-card p-5">
      <div className="relative flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        Smart Coin Balance
        <button aria-label="Coin value info" onClick={() => setTip((t) => !t)} onBlur={() => setTip(false)} className="text-primary"><HelpCircle className="size-4"/></button>
        {tip && <span className="absolute left-32 top-6 z-10 rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-lg">100 Coins = ₹1</span>}
      </div>
      <p className="mt-2 flex items-center gap-2 text-4xl font-extrabold text-primary"><Coins className="size-8"/>{data.wallet.coins.toLocaleString("en-IN")}</p>
      <p className="mt-1 text-xs text-muted-foreground">≈ ₹{money.format(data.wallet.coins / 100)}</p>
    </div>

    <SectionTitle icon={<PlaySquare className="size-6 text-primary"/>}>Watch Video Ad</SectionTitle>
    <div className="earn-video rounded-2xl border border-wallet-violet p-4">
      <p className="font-bold">Watch a 5-second video</p>
      <p className="mt-1 text-sm text-foreground/75">Earn +10 coins per ad (up to 20 per day).</p>
      <Button className="mt-4 w-full" variant="wallet" size="wallet" onClick={() => setAdOpen(true)}><PlaySquare/>Watch Ad · +10 Coins</Button>
    </div>

    <SectionTitle icon={<Users className="size-6 text-primary"/>}>Refer & Earn</SectionTitle>
    <div className="earn-refer rounded-2xl border border-wallet-green p-4">
      <p className="text-sm text-foreground/80">Earn <span className="font-bold text-primary">+1,000 coins</span> when a friend joins with your code.</p>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-primary bg-background/40 p-3">
        <span className="font-mono text-2xl font-bold tracking-widest text-primary">{myCode}</span>
        <button aria-label="Copy code" onClick={async () => { await navigator.clipboard.writeText(myCode); toast.success("Code copied"); }} className="text-primary"><Copy className="size-5"/></button>
      </div>
      <Button className="mt-3 w-full" variant="wallet" size="wallet" onClick={share}><Share2/>Share Invite</Button>
      {!data.wallet.referred_by && <form onSubmit={redeem} className="mt-4 flex gap-2">
        <Input placeholder="Have a friend's code?" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} className="h-11"/>
        <Button type="submit" variant="walletOutline" className="h-11" disabled={busy || code.trim().length < 4}>{busy ? <LoaderCircle className="animate-spin"/> : "Apply"}</Button>
      </form>}
    </div>

    <AdDialog open={adOpen} title="Video Ad" onDone={finishAd} onCancel={() => { setAdOpen(false); toast.info("Ad skipped — no coins earned"); }}/>
  </section>;
}

/* ---------------- Spin tab ---------------- */
const SEGMENTS = [
  { label: "10", prize: 10 }, { label: "20", prize: 20 }, { label: "50", prize: 50 },
  { label: "100", prize: 100 }, { label: "200", prize: 200 }, { label: "Try Again", prize: 0 },
];
const SEG_COLORS = ["var(--wallet-blue)", "var(--wallet-violet)", "var(--wallet-green)", "var(--wallet-cyan)", "var(--primary)", "var(--muted)"];

function SpinTab({ data, refresh }: { data: WalletData; refresh: () => Promise<void> }) {
  const doSpin = useServerFn(spinWheel);
  const doUnlock = useServerFn(unlockSpinAd);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [tryAgainOpen, setTryAgainOpen] = useState(false);
  const [adOpen, setAdOpen] = useState(false);
  const { freeLeft, bonusAvailable, canWatchAd } = data.spin;
  const spinsLeft = freeLeft + (bonusAvailable ? 1 : 0);

  const spin = async () => {
    if (spinning || spinsLeft === 0) return;
    setSpinning(true);
    try {
      const { prize } = await doSpin();
      const idx = SEGMENTS.findIndex((s) => s.prize === prize);
      const target = 360 - (idx * 60 + 30);
      setRotation((r) => r - (r % 360) + 360 * 6 + target);
      await new Promise((res) => setTimeout(res, 4200));
      const fresh = refresh();
      if (prize > 0) toast.success(`You won ${prize} coins!`);
      await fresh;
      if (prize === 0) setTryAgainOpen(true);
    } catch (e) { toast.error(errMsg(e, "Could not spin")); }
    finally { setSpinning(false); }
  };

  const finishAd = async () => {
    try { await doUnlock(); await refresh(); toast.success("Extra spin unlocked!"); }
    catch (e) { toast.error(errMsg(e, "Could not unlock spin")); }
    finally { setAdOpen(false); }
  };

  const gradient = `conic-gradient(${SEGMENTS.map((_, i) => `${SEG_COLORS[i]} ${i * 60}deg ${(i + 1) * 60}deg`).join(", ")})`;

  return <section className="pt-6 text-center">
    <SectionTitle icon={<Gift className="size-7 text-primary"/>}>Lucky Spin</SectionTitle>
    <p className="-mt-2 text-sm text-muted-foreground">{spinsLeft > 0 ? `${spinsLeft} spin${spinsLeft > 1 ? "s" : ""} left today` : "No spins left — resets tomorrow"}{data.wallet.is_vip && " · VIP bonus spin included"}</p>

    <div className="relative mx-auto mt-6 size-72">
      <div className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2 border-x-[14px] border-t-[24px] border-x-transparent border-t-primary drop-shadow"/>
      <div className="size-full rounded-full border-[6px] border-primary shadow-2xl shadow-primary/30" style={{ background: gradient, transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none" }}>
        {SEGMENTS.map((s, i) => <div key={s.label} className="absolute inset-0 flex justify-center pt-5" style={{ transform: `rotate(${i * 60 + 30}deg)` }}>
          <span className={`font-extrabold ${s.prize === 0 ? "text-xs text-foreground" : "text-lg text-background"}`}>{s.label}{s.prize > 0 && <Coins className="mx-auto size-3"/>}</span>
        </div>)}
      </div>
      <button onClick={spin} disabled={spinning || spinsLeft === 0} className="absolute left-1/2 top-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-background bg-primary font-extrabold text-primary-foreground shadow-xl disabled:opacity-60">
        {spinning ? <LoaderCircle className="animate-spin"/> : "SPIN"}
      </button>
    </div>

    {canWatchAd && !spinning && <Button className="mt-6 w-full" variant="walletOutline" size="wallet" onClick={() => setAdOpen(true)}><PlaySquare/>Watch Ad for Extra Spin</Button>}
    <p className="mt-6 text-xs text-muted-foreground">1 free spin per day. Landing on “Try Again” lets you watch one ad for a bonus spin.</p>

    <Dialog open={tryAgainOpen} onOpenChange={setTryAgainOpen}>
      <DialogContent className="w-[calc(100%-2rem)] rounded-2xl border-primary bg-card text-center">
        <Sparkles className="mx-auto size-12 text-primary"/>
        {data.spin.canWatchAd ? <>
          <DialogHeader><DialogTitle className="text-center">Better luck!</DialogTitle><DialogDescription className="text-center">Watch 1 quick video ad to get 1 extra spin!</DialogDescription></DialogHeader>
          <Button variant="wallet" size="wallet" onClick={() => { setTryAgainOpen(false); setAdOpen(true); }}><PlaySquare/>Watch Ad</Button>
          <Button variant="ghost" onClick={() => setTryAgainOpen(false)}>Maybe later</Button>
        </> : <>
          <DialogHeader><DialogTitle className="text-center">Try Again</DialogTitle><DialogDescription className="text-center">{data.spin.freeLeft + (data.spin.bonusAvailable ? 1 : 0) > 0 ? "You still have a spin left today!" : "No more spins today. Your spins reset in 24 hours."}</DialogDescription></DialogHeader>
          <Button variant="wallet" size="wallet" onClick={() => setTryAgainOpen(false)}>OK</Button>
        </>}
      </DialogContent>
    </Dialog>
    <AdDialog open={adOpen} title="Watch to unlock a spin" onDone={finishAd} onCancel={() => { setAdOpen(false); toast.info("Ad skipped — spin not unlocked"); }}/>
  </section>;
}

/* ---------------- Auth ---------------- */
function AuthScreen() {
  const [mode, setMode] = useState<"signin"|"signup">("signin");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); try {
    if (mode === "signin") { const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error; }
    else { const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } }); if (error) throw error; if (!data.session) toast.success("Check your email to confirm your account"); }
  } catch (error) { toast.error(errMsg(error, "Sign-in failed")); } finally { setBusy(false); } };
  const google = async () => { const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin }); if (result.error) toast.error(result.error.message); };
  return <main className="wallet-shell grid min-h-screen place-items-center p-5"><div className="w-full max-w-sm"><div className="mb-8 text-center"><WalletCards className="mx-auto mb-3 size-14 text-primary"/><h1 className="font-display text-4xl text-primary">Smart Wallet</h1><p className="mt-2 text-sm text-muted-foreground">Your money, coins, and rewards in one place.</p></div><div className="rounded-2xl border border-border bg-card p-5"><div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1"><Button variant={mode === "signin" ? "wallet" : "ghost"} onClick={() => setMode("signin")}>Sign in</Button><Button variant={mode === "signup" ? "wallet" : "ghost"} onClick={() => setMode("signup")}>Create account</Button></div><form onSubmit={submit} className="space-y-4"><Input type="email" required maxLength={255} placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)}/><Input type="password" required minLength={8} maxLength={72} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}/><Button className="w-full" variant="wallet" size="wallet" disabled={busy}>{busy && <LoaderCircle className="animate-spin"/>}{mode === "signin" ? "Sign in" : "Create account"}</Button></form><div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border"/>OR<span className="h-px flex-1 bg-border"/></div><Button className="w-full" variant="outline" size="wallet" onClick={google}>Continue with Google</Button></div></div></main>;
}

function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) { return <h2 className="mb-3 mt-6 flex items-center gap-2 text-2xl font-extrabold">{icon}{children}</h2>; }
function EarnCard({ className, icon, title, reward, onClick }: { className: string; icon: React.ReactNode; title: string; reward: string; onClick: () => void }) { return <button onClick={onClick} className={`min-h-40 rounded-2xl border p-4 text-left shadow-xl ${className}`}><div className="[&_svg]:size-10">{icon}</div><div className="mt-5 flex items-end justify-between"><div><p className="text-base font-bold leading-tight">{title}</p><p className="mt-2 font-extrabold text-primary">{reward}</p></div><ChevronRight className="size-5"/></div></button>; }
function OverviewRow({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value?: string; onClick: () => void }) { return <button onClick={onClick} className="mb-3 flex min-h-16 w-full items-center rounded-2xl border border-border bg-card/70 text-left"><span className="grid size-16 shrink-0 place-items-center border-r border-border text-primary [&_svg]:size-7">{icon}</span><span className="flex flex-1 items-center justify-between gap-2 px-4"><span className="text-sm font-semibold text-muted-foreground">{label}</span>{value && <span className="font-extrabold text-primary">{value}</span>}<ChevronRight className="size-5 shrink-0 text-muted-foreground"/></span></button>; }

const KIND_LABEL: Record<string, string> = { deposit: "Deposit", withdrawal: "Withdrawal", reward: "Streak", earning: "Earning", ad: "Ad", spin: "Spin", referral: "Referral", vip: "VIP" };
function Transactions({ data }: { data: WalletData["transactions"] }) {
  return <section className="pt-6"><SectionTitle>Transaction History</SectionTitle>{data.length === 0 ? <EmptyTab icon={<ReceiptText/>} title="No transactions yet" text="Your wallet activity will appear here."/> : data.map((item) => {
    const debit = item.amount < 0;
    return <div key={item.id} className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className={`grid size-10 place-items-center rounded-full ${debit ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"}`}>{debit ? <ArrowUpRight/> : item.amount > 0 ? <ArrowDownLeft/> : <Coins/>}</div>
      <div className="min-w-0 flex-1"><p className="font-semibold">{item.description}</p><p className="text-xs text-muted-foreground"><span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase">{KIND_LABEL[item.kind] ?? item.kind}</span>{formatTime(item.created_at)}</p></div>
      <div className="text-right">
        {item.amount !== 0 && <p className={`font-bold ${debit ? "text-destructive" : "text-primary"}`}>{debit ? "-" : "+"}₹{money.format(Math.abs(item.amount))}</p>}
        {item.coins > 0 && <p className={item.amount !== 0 ? "text-xs text-muted-foreground" : "font-bold text-primary"}>+{item.coins.toLocaleString("en-IN")} coins</p>}
      </div>
    </div>;
  })}</section>;
}
function EmptyTab({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <section className="grid min-h-[60vh] place-items-center text-center"><div><div className="mx-auto mb-4 grid size-20 place-items-center rounded-full bg-card text-primary [&_svg]:size-10">{icon}</div><h2 className="text-xl font-bold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{text}</p></div></section>; }

function AccountTab({ data, onVip, onSignOut }: { data: WalletData; onVip: () => void; onSignOut: () => void }) {
  const w = data.wallet;
  const row = (label: string, value: React.ReactNode) => <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"><span className="text-sm text-muted-foreground">{label}</span><span className="min-w-0 truncate text-right text-sm font-semibold">{value}</span></div>;
  return <section className="pt-6"><SectionTitle>Account</SectionTitle>
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-3"><div className={`grid size-14 place-items-center rounded-full ${w.is_vip ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>{w.is_vip ? <Crown className="fill-current"/> : <UserRound/>}</div>
        <div className="min-w-0"><p className="truncate font-bold">{data.user.email || "Smart Wallet member"}</p><div className="mt-1"><VipBadge isVip={w.is_vip} onClick={onVip}/></div></div></div>
      {row("Email", data.user.email || "—")}
      {row("UID", <button className="inline-flex items-center gap-1 font-mono text-xs" onClick={async () => { await navigator.clipboard.writeText(data.user.id); toast.success("UID copied"); }}>{data.user.id.slice(0, 8)}…{data.user.id.slice(-4)}<Copy className="size-3"/></button>)}
      {row("VIP status", w.is_vip ? <span className="text-primary">Active</span> : <button className="text-primary underline" onClick={onVip}>Not active · Upgrade</button>)}
      {row("Current balance", `₹ ${money.format(w.balance)}`)}
      {row("Total deposited", `₹ ${money.format(w.total_deposited)}`)}
      {row("Coin balance", <span className="text-primary"><Coins className="mr-1 inline size-4"/>{w.coins.toLocaleString("en-IN")}</span>)}
      {row("Total coins earned", <span className="text-primary"><Zap className="mr-1 inline size-4"/>{w.total_coins_earned.toLocaleString("en-IN")}</span>)}
      {row("Referral code", <span className="font-mono">{w.referral_code}</span>)}
      <Button variant="outline" size="wallet" className="mt-4 w-full" onClick={onSignOut}><LogOut/>Sign out</Button>
    </div>
  </section>;
}
function LoadingScreen() { return <main className="wallet-shell grid min-h-screen place-items-center"><LoaderCircle className="size-10 animate-spin text-primary"/></main>; }

function BottomNav({ active, setActive }: { active: Tab; setActive: (tab: Tab) => void }) { const items = useMemo(() => [{id:"home" as const,label:"Home",icon:Home},{id:"earn" as const,label:"Earn",icon:BadgeIndianRupee},{id:"spin" as const,label:"Daily Spin",icon:Gift},{id:"history" as const,label:"History",icon:History},{id:"account" as const,label:"Account",icon:UserRound}], []); return <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex h-20 max-w-[480px] items-center justify-around border-t border-border bg-card/95 px-2 backdrop-blur-xl">{items.map(({id,label,icon:Icon}) => <button key={id} onClick={() => setActive(id)} className={`flex h-full min-w-14 flex-col items-center justify-center gap-1 border-b-2 text-[11px] font-semibold transition-colors ${active === id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}><Icon className={`size-6 ${active === id ? "fill-current" : ""}`}/>{label}</button>)}</nav>; }

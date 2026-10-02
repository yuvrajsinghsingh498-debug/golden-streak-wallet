import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import confetti from "canvas-confetti";
import {
  Bell, Crown, WalletCards, Landmark, Plus, ChevronRight, Flame, PlaySquare, ShieldCheck, Volume2,
  ReceiptText, Home, BadgeIndianRupee, History, UserRound, Gift, Coins,
  LogOut, LoaderCircle, Trophy, Copy, HelpCircle, Zap, Sparkles, ArrowDownLeft, ArrowUpRight,
} from "lucide-react";
import { toast } from "@/components/ui/app-toast";
import { Input } from "@/components/ui/input";
import { checkAdmin } from "@/lib/admin.functions";
import welcomeVideo from "@/assets/welcome-video.mp4.asset.json";

import { Button } from "@/components/ui/button";
import { DepositDialog, VipDialog, WithdrawDialog, RedeemDialog, SavingsGoals, ReferSection } from "@/components/wallet/extras";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import {
  buyVip, claimReward, loadWallet, markNotificationsRead, spinWheel, unlockSpinAd, watchAd,
} from "@/lib/wallet.functions";

type WalletData = Awaited<ReturnType<typeof loadWallet>>;
type Tab = "home" | "earn" | "spin" | "history" | "account";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Smart Saver — Money, Coins & Daily Rewards" },
    { name: "description", content: "Manage your withdrawable balance, earn coins, spin daily, grow streaks, and review wallet activity." },
    { property: "og:title", content: "Smart Saver — Money, Coins & Daily Rewards" },
    { property: "og:description", content: "Your Smart Saver wallet for balances, coins, spins, streaks, and rewards." },
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
  const saveReward = useServerFn(claimReward);
  const purchaseVip = useServerFn(buyVip);
  const readAll = useServerFn(markNotificationsRead);
  const verifyAdmin = useServerFn(checkAdmin);
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [addOpen, setAddOpen] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [goalVersion, setGoalVersion] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rewardMilestone, setRewardMilestone] = useState<100 | 200 | 500 | null>(null);

  const refresh = async () => {
    const result = await getWallet();
    setWalletData(result);
    if (result.transactions.some((t) => t.description === "Welcome bonus") && typeof window !== "undefined" && !window.sessionStorage.getItem(`welcome-${result.user.id}`)) {
      window.sessionStorage.setItem(`welcome-${result.user.id}`, "shown");
      setWelcomeOpen(true);
    }
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
      if (hasSession) { refresh().catch(() => toast.error("Could not load your wallet")); verifyAdmin().then(r => setIsAdmin(r.isAdmin)).catch(() => undefined); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setSignedIn(Boolean(session));
      router.invalidate();
      if (session) { refresh().catch(() => toast.error("Could not load your wallet")); verifyAdmin().then(r => setIsAdmin(r.isAdmin)).catch(() => undefined); }
      else { setWalletData(null); setIsAdmin(false); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  if (!sessionReady) return <LoadingScreen />;
  if (!signedIn) return <AuthScreen />;
  if (!walletData) return <LoadingScreen />;

  const wallet = walletData.wallet;
  const unread = walletData.notifications.filter((n) => !n.is_read).length;

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
          <h1 className="flex min-w-0 items-center gap-2 font-display text-2xl font-bold text-gold-soft sm:text-3xl"><img src="/brand-emblem.png" alt="" className="size-12 shrink-0 object-contain"/>Smart Saver</h1>
          <div className="flex items-center gap-2">
            <div id="header-coin-balance" className="hidden items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary sm:flex"><Coins className="size-4"/>{wallet.coins.toLocaleString("en-IN")}</div>
            <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative text-primary" onClick={() => openNotifications(true)}>
              <Bell className="size-7 fill-current"/>
              {unread > 0 && <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">{unread > 9 ? "9+" : unread}</span>}
            </Button>
            <VipBadge isVip={wallet.is_vip} onClick={onVipClick}/>
          </div>
        </header>

        {activeTab === "home" && <>
          <section className="money-card relative mt-5 overflow-hidden rounded-lg border border-primary/50 p-5 shadow-[var(--shadow-gold)]">
            <WalletCards className="absolute -right-5 top-7 size-36 rotate-[-12deg] text-foreground/15" strokeWidth={1.5}/>
            <div className="relative flex items-start gap-4"><div className="grid size-14 place-items-center rounded-2xl bg-foreground/15"><WalletCards className="size-9"/></div><div><h2 className="text-xl font-extrabold">SMART MONEY</h2><p className="text-sm text-foreground/75">Withdrawable Balance</p></div></div>
            <div className="relative mt-5 text-4xl font-extrabold">₹ {money.format(wallet.balance)}</div>
            <div className="relative mt-6 grid grid-cols-2 gap-3">
              <Button variant="walletOutline" size="wallet" onClick={() => setWithdrawOpen(true)}><Landmark/>Withdraw<ChevronRight/></Button>
              <Button variant="wallet" size="wallet" onClick={() => setAddOpen(true)}><Plus className="rounded-full bg-primary-foreground p-0.5 text-primary"/>Add Coins<ChevronRight/></Button>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-border bg-card/80 p-4 shadow-xl">
            <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase text-primary">Daily Streak Reward</p><h2 className="mt-1 flex items-center gap-2 text-xl font-extrabold"><Flame className="size-6 fill-current text-primary"/>{wallet.current_streak} Days Active</h2></div><div className="text-right"><p className="text-xs text-muted-foreground">Coin balance</p><p className="font-bold text-primary"><Coins className="mr-1 inline size-4"/>{wallet.coins.toLocaleString("en-IN")}</p></div></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, wallet.current_streak / 5)}%` }}/></div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {([100,200,500] as const).map((day) => <div key={day} className={`rounded-lg border p-2 text-center ${wallet.current_streak >= day ? "border-primary bg-primary/10" : "border-border bg-muted/40"}`}><Trophy className="mx-auto mb-1 size-4 text-primary"/><p className="text-xs font-bold">{day} Streak</p><p className="mt-0.5 text-[11px] text-primary">+{rewards[day].toLocaleString("en-IN")} Coins</p></div>)}
            </div>
          </section>

          <SavingsGoals isVip={wallet.is_vip} balance={Number(wallet.balance)} version={goalVersion} onChange={async () => { await refresh(); setGoalVersion(v => v + 1); }}/>


          <SectionTitle>Wallet Overview</SectionTitle>
          <OverviewRow icon={<WalletCards/>} label="Available Balance" value={`₹ ${money.format(wallet.balance)}`} onClick={() => setAddOpen(true)}/>
          <OverviewRow icon={<ReceiptText/>} label={walletData.transactions.length ? `${walletData.transactions.length} recent transactions` : "Your transactions will appear here."} onClick={() => setActiveTab("history")}/>
        </>}

        {activeTab === "earn" && <EarnTab data={walletData} refresh={refresh} onRedeem={() => setRedeemOpen(true)}/>}
        {activeTab === "spin" && <SpinTab data={walletData} refresh={refresh} onVip={() => setVipOpen(true)}/>} 
        {activeTab === "history" && <Transactions data={walletData.transactions}/>}
        {activeTab === "account" && <AccountTab data={walletData} isAdmin={isAdmin} onVip={onVipClick} onSignOut={async () => { await supabase.auth.signOut(); setActiveTab("home"); }}/>}
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

      <DepositDialog open={addOpen} onOpenChange={setAddOpen} onDone={async () => { await refresh(); setGoalVersion(v => v + 1); }}/>
       <RedeemDialog open={redeemOpen} onOpenChange={setRedeemOpen} coins={wallet.coins} onDone={refresh}/>
      <WithdrawDialog open={withdrawOpen} onOpenChange={setWithdrawOpen} balance={Number(wallet.balance)} defaultUpi={wallet.default_upi} onDone={refresh}/>
      <VipDialog open={vipOpen} onOpenChange={setVipOpen} balance={Number(wallet.balance)} busy={saving} onPayWallet={handleVip} onDone={refresh}/>

      <Dialog open={rewardMilestone !== null} onOpenChange={() => undefined}><DialogContent className="w-[calc(100%-2rem)] rounded-2xl border-primary bg-card text-center"><Trophy className="mx-auto size-14 text-primary"/><DialogHeader><DialogTitle>Streak milestone reached!</DialogTitle><DialogDescription>You completed {rewardMilestone} active days. Claim your {rewardMilestone ? rewards[rewardMilestone].toLocaleString("en-IN") : 0} coin reward.</DialogDescription></DialogHeader><Button variant="wallet" size="wallet" onClick={handleClaim} disabled={saving}>{saving && <LoaderCircle className="animate-spin"/>}Claim Reward</Button></DialogContent></Dialog>
    </main>
  );
}

function VipBadge({ isVip, onClick }: { isVip: boolean; onClick: () => void }) {
  return <Button variant="ghost" onClick={onClick} className={`flex h-9 items-center gap-1.5 rounded-full border-2 px-3 font-extrabold ${isVip ? "border-primary bg-primary/15 text-primary shadow-[0_0_18px] shadow-primary/40" : "border-muted-foreground/50 text-muted-foreground"}`}>
    <Crown className={`size-5 ${isVip ? "fill-current" : ""}`}/>{isVip ? "VIP" : "Get VIP"}
  </Button>;
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
function EarnTab({ data, refresh, onRedeem }: { data: WalletData; refresh: () => Promise<void>; onRedeem: () => void }) {
  const doWatch = useServerFn(watchAd);
  const [adOpen, setAdOpen] = useState(false);
  const [tip, setTip] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const w = data.wallet;
  const today = new Date().toDateString();
  const adDate = w.last_ad_date ? new Date(`${w.last_ad_date}T00:00:00`).toDateString() : "";
  const watched = adDate === today ? w.ads_watched_today : 0;
  const limit = w.is_vip ? 50 : 20;
  const reward = w.is_vip ? 20 : 10;
  const cooldown = Math.max(0, Math.ceil(((w.last_ad_at ? new Date(w.last_ad_at).getTime() : 0) + 35000 - now) / 1000));
  const finishAd = async () => {
    try { await doWatch(); await refresh(); toast.success(`+${reward} coins earned!`); }
    catch (e) { toast.error(errMsg(e, "Could not credit ad reward")); }
    finally { setAdOpen(false); }
  };
  return <section className="pt-6">
    <div className="rounded-lg border border-primary/50 bg-card p-5">
      <div className="relative flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">Smart Coin Balance
        <Button variant="ghost" size="icon" aria-label="Coin value info" title="Coin value" onClick={() => setTip(t => !t)} className="size-6 text-primary"><HelpCircle className="size-4"/></Button>
        {tip && <span className="absolute left-0 top-7 z-10 rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-lg">100 Coins = ₹1</span>}
      </div>
      <p className="mt-2 flex items-center gap-2 text-4xl font-extrabold text-primary"><Coins className="size-8"/>{w.coins.toLocaleString("en-IN")}</p>
      <p className="mt-1 text-xs text-muted-foreground">≈ ₹{money.format(w.coins / 100)}</p>
      <Button variant="wallet" size="wallet" className="mt-4 w-full" onClick={onRedeem} disabled={w.coins < 100}><Coins/>Redeem Coins · 100 = ₹1</Button>
    </div>
    <SectionTitle icon={<PlaySquare className="size-6 text-primary"/>}>Watch Video Ad</SectionTitle>
    <div className="earn-video rounded-lg border border-wallet-violet p-4">
      <div className="flex justify-between gap-3"><p className="font-bold">Daily ads</p><p className="font-bold text-primary">{watched} / {limit}</p></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${watched / limit * 100}%` }}/></div>
      <p className="mt-3 text-sm text-foreground/75">+{reward} coins per ad {w.is_vip ? "· VIP" : "· Free"}</p>
      <Button className="mt-4 w-full" variant="wallet" size="wallet" disabled={adOpen || cooldown > 0 || watched >= limit} onClick={() => setAdOpen(true)}><PlaySquare/>{watched >= limit ? "Daily limit reached" : cooldown > 0 ? `Next ad in ${cooldown}s` : `Watch Ad · +${reward} Coins`}</Button>
    </div>
    <AdDialog open={adOpen} title="Video Ad" onDone={finishAd} onCancel={() => { setAdOpen(false); toast.info("Ad skipped — no coins earned"); }}/>
  </section>;
}

/* ---------------- Spin tab ---------------- */
const SEGMENTS = [
  { label: "10", prize: 10 }, { label: "20", prize: 20 }, { label: "50", prize: 50 },
  { label: "100", prize: 100 }, { label: "200", prize: 200 }, { label: "Try Again", prize: 0 },
];
const SEG_COLORS = ["var(--secondary)", "var(--card)", "color-mix(in oklab, var(--secondary) 72%, var(--primary))", "color-mix(in oklab, var(--card) 80%, var(--primary))", "var(--secondary)", "var(--card)"];

function SpinTab({ data, refresh, onVip }: { data: WalletData; refresh: () => Promise<void>; onVip: () => void }) {
  const doSpin = useServerFn(spinWheel);
  const doUnlock = useServerFn(unlockSpinAd);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [tryAgainOpen, setTryAgainOpen] = useState(false);
  const [adOpen, setAdOpen] = useState(false);
  const [win, setWin] = useState<number | null>(null);
  const [coinsFlying, setCoinsFlying] = useState(false);
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
      if (prize > 0) {
        const awarded = prize * (data.wallet.is_vip ? 2 : 1);
        setWin(awarded);
        setCoinsFlying(true);
        window.setTimeout(() => setCoinsFlying(false), 1350);
        if (navigator.vibrate) navigator.vibrate([70, 45, 120]);
        confetti({ particleCount: 110, spread: 92, startVelocity: 42, origin: { y: 0.62 }, colors: ["#c5a059", "#f5e0b8", "#ffffff", "#4cc9a4", "#f05d5e"] });
        window.setTimeout(() => confetti({ particleCount: 65, angle: 60, spread: 70, origin: { x: 0, y: 0.55 }, colors: ["#c5a059", "#f5e0b8", "#ffffff"] }), 180);
        window.setTimeout(() => confetti({ particleCount: 65, angle: 120, spread: 70, origin: { x: 1, y: 0.55 }, colors: ["#c5a059", "#f5e0b8", "#ffffff"] }), 220);
        try { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.type = "sine"; osc.frequency.setValueAtTime(523, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(1046, ctx.currentTime + 0.25); gain.gain.setValueAtTime(0.08, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45); osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.45); osc.onended = () => ctx.close(); } catch { /* audio unavailable */ }
      }
      await refresh();
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
    <SectionTitle icon={<Gift className="size-7 text-primary"/>}>Spin the Wheel</SectionTitle>
    <p className="-mt-2 text-sm text-muted-foreground">{spinsLeft > 0 ? `${spinsLeft} spin${spinsLeft > 1 ? "s" : ""} left today` : "No spins left — resets tomorrow"}{data.wallet.is_vip && " · VIP bonus spin included"}</p>

    <div className="relative mx-auto mt-8 size-72 sm:size-80">
      <div className="spin-pointer-glow absolute left-1/2 top-[-14px] z-20 -translate-x-1/2"><div className="h-10 w-8 rounded-t-full border-2 border-gold-soft bg-primary shadow-[0_0_22px_var(--primary)] [clip-path:polygon(0_0,100%_0,50%_100%)]"/></div>
      <div className="absolute inset-[-16px] rounded-full border border-primary/45 bg-card shadow-[0_0_45px_color-mix(in_oklab,var(--primary)_28%,transparent)]"/>
      <div className="absolute inset-[-9px] rounded-full border-[7px] border-double border-primary bg-secondary shadow-inner"/>
      <div className="relative size-full rounded-full border-[3px] border-gold-soft shadow-2xl" style={{ background: gradient, transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4.2s cubic-bezier(0.08, 0.68, 0.08, 1)" : "none" }}>
        {SEGMENTS.map((s, i) => <div key={s.label} className="absolute inset-0 flex justify-center pt-5" style={{ transform: `rotate(${i * 60 + 30}deg)` }}>
          <span className={`drop-shadow-sm ${s.prize === 0 ? "max-w-12 text-xs font-bold text-gold-soft" : "text-lg font-extrabold text-gold-soft"}`}>{s.label}{s.prize > 0 && <Coins className="mx-auto size-3"/>}</span>
        </div>)}
      </div>
      <Button variant="wallet" onClick={spin} disabled={spinning || spinsLeft === 0} className="absolute left-1/2 top-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-gold-soft bg-primary p-0 font-extrabold text-primary-foreground shadow-[0_0_25px_var(--primary)] disabled:opacity-60">
        {spinning ? <LoaderCircle className="animate-spin"/> : "SPIN"}
      </Button>
    </div>

    {canWatchAd && !spinning && <Button className="mt-6 w-full" variant="walletOutline" size="wallet" onClick={() => setAdOpen(true)}><PlaySquare/>Watch Ad for Extra Spin</Button>}
    <p className="mt-6 text-xs text-muted-foreground">1 free spin per day. Landing on “Try Again” lets you watch one ad for a bonus spin.</p>

    <ReferSection code={data.wallet.referral_code} referredBy={data.wallet.referred_by} onDone={refresh}/>

    {coinsFlying && <div className="pointer-events-none fixed inset-0 z-[70]" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <Coins key={i} className="coin-flight absolute bottom-[26%] left-1/2 size-7 text-primary" style={{ "--coin-mid-x": `${(i - 6) * 13}px`, "--coin-end-x": `${130 + (i % 4) * 12}px`, "--coin-end-y": `${-65 - (i % 3) * 10}vh`, animationDelay: `${i * 45}ms` } as CSSProperties}/>)}</div>}

    <Dialog open={win !== null} onOpenChange={(open) => { if (!open) setWin(null); }}>
      <DialogContent className="w-[calc(100%-2rem)] overflow-hidden rounded-lg border-primary bg-card text-center shadow-[0_0_55px_color-mix(in_oklab,var(--primary)_30%,transparent)]">
        <div className="absolute inset-x-0 top-0 h-1 bg-primary"/>
        <div className="mx-auto grid size-20 place-items-center rounded-full border border-primary bg-primary/10 shadow-[0_0_30px_color-mix(in_oklab,var(--primary)_35%,transparent)]"><Trophy className="size-10 text-primary"/></div>
        <DialogHeader><DialogTitle className="text-center font-display text-3xl text-gold-soft">Congratulations!</DialogTitle><DialogDescription className="text-center text-base">You Won <span className="font-bold text-primary">{win?.toLocaleString("en-IN")} Coins!</span></DialogDescription></DialogHeader>
        <Button variant="wallet" size="wallet" className="w-full shadow-[0_0_24px_color-mix(in_oklab,var(--primary)_35%,transparent)]" onClick={() => { setWin(null); if (!data.wallet.is_vip) onVip(); }}>{data.wallet.is_vip ? <><Gift/>Claim Reward</> : <><Crown/>Claim & Double with VIP</>}</Button>
        {!data.wallet.is_vip && <Button variant="ghost" onClick={() => setWin(null)}>Claim reward only</Button>}
      </DialogContent>
    </Dialog>

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
  return <main className="wallet-shell grid min-h-screen place-items-center p-5"><div className="w-full max-w-sm"><div className="mb-8 text-center"><WalletCards className="mx-auto mb-3 size-14 text-primary"/><h1 className="font-display text-4xl text-primary">Smart Saver</h1><p className="mt-2 text-sm text-muted-foreground">Your money, coins, and rewards in one place.</p></div><div className="rounded-2xl border border-border bg-card p-5"><div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1"><Button variant={mode === "signin" ? "wallet" : "ghost"} onClick={() => setMode("signin")}>Sign in</Button><Button variant={mode === "signup" ? "wallet" : "ghost"} onClick={() => setMode("signup")}>Create account</Button></div><form onSubmit={submit} className="space-y-4"><Input type="email" required maxLength={255} placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)}/><Input type="password" required minLength={8} maxLength={72} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}/><Button className="w-full" variant="wallet" size="wallet" disabled={busy}>{busy && <LoaderCircle className="animate-spin"/>}{mode === "signin" ? "Sign in" : "Create account"}</Button></form><div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border"/>OR<span className="h-px flex-1 bg-border"/></div><Button className="w-full" variant="outline" size="wallet" onClick={google}>Continue with Google</Button></div></div></main>;
}

function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) { return <h2 className="mb-3 mt-6 flex items-center gap-2 text-2xl font-extrabold">{icon}{children}</h2>; }
function OverviewRow({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value?: string; onClick: () => void }) { return <button onClick={onClick} className="mb-3 flex min-h-16 w-full items-center rounded-2xl border border-border bg-card/70 text-left"><span className="grid size-16 shrink-0 place-items-center border-r border-border text-primary [&_svg]:size-7">{icon}</span><span className="flex flex-1 items-center justify-between gap-2 px-4"><span className="text-sm font-semibold text-muted-foreground">{label}</span>{value && <span className="font-extrabold text-primary">{value}</span>}<ChevronRight className="size-5 shrink-0 text-muted-foreground"/></span></button>; }

const KIND_LABEL: Record<string, string> = { convert: "Redeemed", goal: "Savings Goal", penalty: "Penalty", refund: "Refund", adjustment: "Adjustment", deposit: "Deposit", withdrawal: "Withdrawal", reward: "Streak", earning: "Earning", ad: "Ad", spin: "Spin", referral: "Referral", vip: "VIP" };
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

function AccountTab({ data, isAdmin, onVip, onSignOut }: { data: WalletData; isAdmin: boolean; onVip: () => void; onSignOut: () => void }) {
  const w = data.wallet;
  const row = (label: string, value: React.ReactNode) => <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"><span className="text-sm text-muted-foreground">{label}</span><span className="min-w-0 truncate text-right text-sm font-semibold">{value}</span></div>;
  return <section className="pt-6"><SectionTitle>Account</SectionTitle>
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-3"><div className={`grid size-14 place-items-center rounded-full ${w.is_vip ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>{w.is_vip ? <Crown className="fill-current"/> : <UserRound/>}</div>
        <div className="min-w-0"><p className="truncate font-bold">{data.user.email || "Smart Saver member"}</p><div className="mt-1"><VipBadge isVip={w.is_vip} onClick={onVip}/></div></div></div>
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

import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Bell, Crown, WalletCards, Landmark, Plus, ChevronRight, Flame, PlaySquare,
  Users, ReceiptText, Home, BadgeIndianRupee, History, UserRound, Gift, Coins,
  LogOut, LoaderCircle, Trophy,
} from "lucide-react";
import { toast } from "@/components/ui/app-toast";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { addMoney, claimReward, loadWallet } from "@/lib/wallet.functions";

type WalletData = Awaited<ReturnType<typeof loadWallet>>;
type Tab = "home" | "earn" | "spin" | "history" | "account";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Smart Wallet — Money, Coins & Daily Rewards" },
    { name: "description", content: "Manage your withdrawable balance, earn coins, grow daily streaks, and review wallet activity." },
    { property: "og:title", content: "Smart Wallet — Money, Coins & Daily Rewards" },
    { property: "og:description", content: "Your secure mobile wallet for balances, coins, streaks, and rewards." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: SmartWalletPage,
});

const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rewards = { 100: 1000, 200: 2020, 500: 6000 } as const;

function SmartWalletPage() {
  const router = useRouter();
  const getWallet = useServerFn(loadWallet);
  const saveMoney = useServerFn(addMoney);
  const saveReward = useServerFn(claimReward);
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [addOpen, setAddOpen] = useState(false);
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
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add money"); }
    finally { setSaving(false); }
  };

  const handleClaim = async () => {
    if (!rewardMilestone) return;
    setSaving(true);
    try {
      const result = await saveReward({ data: { milestone: rewardMilestone } });
      toast.success(`${result?.awarded?.toLocaleString("en-IN")} coins claimed`);
      setRewardMilestone(null); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not claim reward"); }
    finally { setSaving(false); }
  };

  return (
    <main className="wallet-shell min-h-screen pb-28">
      <div className="mx-auto w-full max-w-[480px] px-4">
        <header className="flex h-20 items-center justify-between border-b border-primary/45">
          <h1 className="font-display text-3xl font-bold text-primary">Smart Wallet</h1>
          <div className="flex items-center gap-4">
            <button aria-label="Notifications, 3 unread" className="relative text-primary"><Bell className="size-7 fill-current"/><span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">3</span></button>
            <div className="flex items-center gap-1.5 rounded-full border-2 border-primary px-3 py-1.5 font-extrabold text-primary"><Crown className="size-5 fill-current"/>VIP</div>
          </div>
        </header>

        {activeTab === "home" && <>
          <section className="money-card relative mt-5 overflow-hidden rounded-3xl border border-wallet-cyan p-5 shadow-2xl">
            <WalletCards className="absolute -right-5 top-7 size-36 rotate-[-12deg] text-foreground/15" strokeWidth={1.5}/>
            <div className="relative flex items-start gap-4"><div className="grid size-14 place-items-center rounded-2xl bg-foreground/15"><WalletCards className="size-9"/></div><div><h2 className="text-xl font-extrabold">SMART MONEY</h2><p className="text-sm text-foreground/75">Withdrawable Balance</p></div></div>
            <div className="relative mt-5 text-4xl font-extrabold">₹ {money.format(wallet.balance)}</div>
            <div className="relative mt-6 grid grid-cols-2 gap-3">
              <Button variant="walletOutline" size="wallet" onClick={() => toast.info("Withdrawals are coming soon")}><Landmark/>Withdraw<ChevronRight/></Button>
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
            <EarnCard className="earn-video border-wallet-violet" icon={<PlaySquare/>} title="Watch Video Ads" reward="+10 Coins" onClick={() => toast.info("Video rewards are coming soon")}/>
            <EarnCard className="earn-refer border-wallet-green" icon={<Users/>} title="Refer & Earn" reward="+1,000 Coins" onClick={() => toast.info("Referral sharing is coming soon")}/>
          </div>

          <SectionTitle>Wallet Overview</SectionTitle>
          <OverviewRow icon={<WalletCards/>} label="Available Balance" value={`₹ ${money.format(wallet.balance)}`} onClick={() => setAddOpen(true)}/>
          <OverviewRow icon={<ReceiptText/>} label={walletData.transactions.length ? `${walletData.transactions.length} recent transactions` : "Your transactions will appear here."} onClick={() => setActiveTab("history")}/>
        </>}

        {activeTab === "history" && <Transactions data={walletData.transactions}/>} 
        {activeTab === "earn" && <EmptyTab icon={<Gift/>} title="Earn more coins" text="Video and referral rewards will appear here."/>}
        {activeTab === "spin" && <EmptyTab icon={<div className="text-6xl">🎡</div>} title="Daily Spin" text="Your next daily reward wheel is being prepared."/>}
        {activeTab === "account" && <AccountTab onSignOut={async () => { await supabase.auth.signOut(); setActiveTab("home"); }}/>} 
      </div>

      <BottomNav active={activeTab} setActive={setActiveTab}/>

      <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent className="w-[calc(100%-2rem)] rounded-2xl border-border bg-card"><DialogHeader><DialogTitle>Add Money</DialogTitle><DialogDescription>Every ₹1 adds 10 coins to your wallet.</DialogDescription></DialogHeader><form onSubmit={handleAdd}><label className="mb-2 block text-sm font-semibold" htmlFor="amount">Amount</label><div className="relative"><span className="absolute left-3 top-2.5 font-bold text-primary">₹</span><Input id="amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-11 pl-8" autoFocus/></div><p className="mt-2 text-xs text-muted-foreground">You’ll receive {Math.round((Number(amount) || 0) * 10).toLocaleString("en-IN")} coins.</p><DialogFooter className="mt-5"><Button type="submit" variant="wallet" size="wallet" disabled={saving} className="w-full">{saving && <LoaderCircle className="animate-spin"/>}Confirm & Add</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={rewardMilestone !== null} onOpenChange={() => undefined}><DialogContent className="w-[calc(100%-2rem)] rounded-2xl border-primary bg-card text-center"><Trophy className="mx-auto size-14 text-primary"/><DialogHeader><DialogTitle>Streak milestone reached!</DialogTitle><DialogDescription>You completed {rewardMilestone} active days. Claim your {rewardMilestone ? rewards[rewardMilestone].toLocaleString("en-IN") : 0} coin reward.</DialogDescription></DialogHeader><Button variant="wallet" size="wallet" onClick={handleClaim} disabled={saving}>{saving && <LoaderCircle className="animate-spin"/>}Claim Reward</Button></DialogContent></Dialog>
    </main>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<"signin"|"signup">("signin");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); try {
    if (mode === "signin") { const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error; }
    else { const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } }); if (error) throw error; if (!data.session) toast.success("Check your email to confirm your account"); }
  } catch (error) { toast.error(error instanceof Error ? error.message : "Sign-in failed"); } finally { setBusy(false); } };
  const google = async () => { const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin }); if (result.error) toast.error(result.error.message); };
  return <main className="wallet-shell grid min-h-screen place-items-center p-5"><div className="w-full max-w-sm"><div className="mb-8 text-center"><WalletCards className="mx-auto mb-3 size-14 text-primary"/><h1 className="font-display text-4xl text-primary">Smart Wallet</h1><p className="mt-2 text-sm text-muted-foreground">Your money, coins, and rewards in one place.</p></div><div className="rounded-2xl border border-border bg-card p-5"><div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1"><Button variant={mode === "signin" ? "wallet" : "ghost"} onClick={() => setMode("signin")}>Sign in</Button><Button variant={mode === "signup" ? "wallet" : "ghost"} onClick={() => setMode("signup")}>Create account</Button></div><form onSubmit={submit} className="space-y-4"><Input type="email" required maxLength={255} placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)}/><Input type="password" required minLength={8} maxLength={72} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}/><Button className="w-full" variant="wallet" size="wallet" disabled={busy}>{busy && <LoaderCircle className="animate-spin"/>}{mode === "signin" ? "Sign in" : "Create account"}</Button></form><div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border"/>OR<span className="h-px flex-1 bg-border"/></div><Button className="w-full" variant="outline" size="wallet" onClick={google}>Continue with Google</Button></div></div></main>;
}

function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) { return <h2 className="mb-3 mt-6 flex items-center gap-2 text-2xl font-extrabold">{icon}{children}</h2>; }
function EarnCard({ className, icon, title, reward, onClick }: { className: string; icon: React.ReactNode; title: string; reward: string; onClick: () => void }) { return <button onClick={onClick} className={`min-h-40 rounded-2xl border p-4 text-left shadow-xl ${className}`}><div className="[&_svg]:size-10">{icon}</div><div className="mt-5 flex items-end justify-between"><div><p className="text-base font-bold leading-tight">{title}</p><p className="mt-2 font-extrabold text-primary">{reward}</p></div><ChevronRight className="size-5"/></div></button>; }
function OverviewRow({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value?: string; onClick: () => void }) { return <button onClick={onClick} className="mb-3 flex min-h-16 w-full items-center rounded-2xl border border-border bg-card/70 text-left"><span className="grid size-16 shrink-0 place-items-center border-r border-border text-primary [&_svg]:size-7">{icon}</span><span className="flex flex-1 items-center justify-between gap-2 px-4"><span className="text-sm font-semibold text-muted-foreground">{label}</span>{value && <span className="font-extrabold text-primary">{value}</span>}<ChevronRight className="size-5 shrink-0 text-muted-foreground"/></span></button>; }
function Transactions({ data }: { data: WalletData["transactions"] }) { return <section className="pt-6"><SectionTitle>Transaction History</SectionTitle>{data.length === 0 ? <EmptyTab icon={<ReceiptText/>} title="No transactions yet" text="Your wallet activity will appear here."/> : data.map((item) => <div key={item.id} className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-card p-4"><div className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary"><ReceiptText/></div><div className="min-w-0 flex-1"><p className="font-semibold">{item.description}</p><p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p></div><div className="text-right"><p className="font-bold text-primary">{item.amount ? `₹${money.format(item.amount)}` : `+${item.coins.toLocaleString("en-IN")}`}</p><p className="text-xs text-muted-foreground">{item.coins ? `${item.coins.toLocaleString("en-IN")} coins` : item.kind}</p></div></div>)}</section>; }
function EmptyTab({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <section className="grid min-h-[60vh] place-items-center text-center"><div><div className="mx-auto mb-4 grid size-20 place-items-center rounded-full bg-card text-primary [&_svg]:size-10">{icon}</div><h2 className="text-xl font-bold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{text}</p></div></section>; }
function AccountTab({ onSignOut }: { onSignOut: () => void }) { return <section className="pt-6"><SectionTitle>Account</SectionTitle><div className="rounded-2xl border border-border bg-card p-5"><div className="mb-5 flex items-center gap-3"><div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary"><UserRound/></div><div><p className="font-bold">Smart Wallet member</p><p className="text-xs text-muted-foreground">Wallet data is private to this account</p></div></div><Button variant="outline" size="wallet" className="w-full" onClick={onSignOut}><LogOut/>Sign out</Button></div></section>; }
function LoadingScreen() { return <main className="wallet-shell grid min-h-screen place-items-center"><LoaderCircle className="size-10 animate-spin text-primary"/></main>; }

function BottomNav({ active, setActive }: { active: Tab; setActive: (tab: Tab) => void }) { const items = useMemo(() => [{id:"home" as const,label:"Home",icon:Home},{id:"earn" as const,label:"Earn",icon:BadgeIndianRupee},{id:"spin" as const,label:"Daily Spin",icon:Gift},{id:"history" as const,label:"History",icon:History},{id:"account" as const,label:"Account",icon:UserRound}], []); return <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex h-20 max-w-[480px] items-center justify-around border-t border-border bg-card/95 px-2 backdrop-blur-xl">{items.map(({id,label,icon:Icon}) => <button key={id} onClick={() => setActive(id)} className={`flex h-full min-w-14 flex-col items-center justify-center gap-1 border-b-2 text-[11px] font-semibold transition-colors ${active === id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}><Icon className={`size-6 ${active === id ? "fill-current" : ""}`}/>{label}</button>)}</nav>; }
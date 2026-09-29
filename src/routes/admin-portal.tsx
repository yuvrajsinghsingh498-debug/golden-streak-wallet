import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/app-toast";
import { supabase } from "@/integrations/supabase/client";
import { adminLoad, adminPayout, adminReviewDeposit, checkAdmin } from "@/lib/admin.functions";

type AdminData = Awaited<ReturnType<typeof adminLoad>>;
const rupees = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const message = (e: unknown) => e instanceof Error ? e.message : "Please try again";

export const Route = createFileRoute("/admin-portal")({
  head: () => ({ meta: [
    { title: "Admin Portal | Smart Saver" },
    { name: "description", content: "Review pending Smart Saver deposits and withdrawal payouts." },
    { property: "og:title", content: "Admin Portal | Smart Saver" },
    { property: "og:description", content: "Manage Smart Saver payment requests securely." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AdminPortal,
});

function AdminPortal() {
  const verify = useServerFn(checkAdmin);
  const load = useServerFn(adminLoad);
  const reviewDeposit = useServerFn(adminReviewDeposit);
  const payout = useServerFn(adminPayout);
  const [status, setStatus] = useState<"loading" | "denied" | "ready">("loading");
  const [data, setData] = useState<AdminData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [utr, setUtr] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const refresh = async () => { const result = await load(); setData(result); };
  useEffect(() => {
    let live = true;
    supabase.auth.getUser().then(async ({ data: auth, error: authError }) => {
      if (!live) return;
      if (authError || !auth.user) { setStatus("denied"); return; }
      try {
        const result = await verify();
        if (!live) return;
        if (!result.isAdmin) { setStatus("denied"); return; }
        const loaded = await load();
        if (live) { setData(loaded); setStatus("ready"); }
      } catch (e) { if (live) { setStatus("denied"); setError(message(e)); } }
    });
    return () => { live = false; };
  }, []);

  const act = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusy(id);
    try { await action(); await refresh(); toast.success(success); }
    catch (e) { toast.error(message(e)); }
    finally { setBusy(null); }
  };

  return <main className="wallet-shell min-h-screen px-4 pb-16 text-foreground">
    <div className="mx-auto max-w-5xl">
      <header className="flex min-h-20 items-center justify-between gap-4 border-b border-border">
        <div className="flex items-center gap-3"><Button asChild variant="ghost" size="icon" aria-label="Back to wallet"><Link to="/"><ArrowLeft/></Link></Button><h1 className="text-xl font-bold text-primary">Admin Portal</h1></div>
        {status === "ready" && <Button variant="outline" size="icon" aria-label="Refresh requests" title="Refresh requests" onClick={() => refresh().catch(e => toast.error(message(e)))}><RefreshCw/></Button>}
      </header>
      {status === "loading" && <div className="grid min-h-80 place-items-center"><LoaderCircle className="animate-spin text-primary"/></div>}
      {status === "denied" && <section className="py-16 text-center"><h2 className="text-xl font-bold">Access denied</h2><p className="mt-2 text-sm text-muted-foreground">Only the authorized administrator can view payment requests.</p>{error && <p className="mt-2 text-xs text-destructive">{error}</p>}</section>}
      {status === "ready" && data && <>
        <section className="py-7"><h2 className="text-xl font-bold">Pending deposits <span className="text-primary">({data.deposits.length})</span></h2>
          <div className="mt-4 space-y-3">{data.deposits.length === 0 && <p className="text-sm text-muted-foreground">No pending deposits.</p>}
            {data.deposits.map(d => <article key={d.id} className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0 space-y-1 text-sm"><p className="font-bold text-primary">₹{rupees.format(Number(d.amount))} <span className="ml-2 text-xs text-muted-foreground">{d.purpose === "vip" ? "VIP pass" : "Smart Money"}</span></p><p className="break-all">{d.user_email || "Member"} · <span className="font-mono text-xs">{d.user_id}</span></p><p>UPI ID: <span className="font-semibold">smartsaver@upi</span></p><p>Payment UTR: <span className="font-mono font-semibold">{d.utr_number}</span></p><p className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString("en-IN")}</p></div>
              <div className="flex flex-wrap gap-2"><Button variant="wallet" disabled={busy !== null} onClick={() => act(d.id, () => reviewDeposit({ data: { id: d.id, approve: true } }), "Deposit approved")}><Check/>Approve</Button><Button variant="destructive" disabled={busy !== null} onClick={() => act(d.id, () => reviewDeposit({ data: { id: d.id, approve: false } }), "Deposit rejected")}><X/>Reject</Button></div>
            </article>)}
          </div>
        </section>
        <section className="border-t border-border py-7"><h2 className="text-xl font-bold">Pending withdrawals <span className="text-primary">({data.withdrawals.length})</span></h2>
          <div className="mt-4 space-y-3">{data.withdrawals.length === 0 && <p className="text-sm text-muted-foreground">No pending withdrawals.</p>}
            {data.withdrawals.map(w => <article key={w.id} className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0 space-y-1 text-sm"><p className="font-bold text-primary">₹{rupees.format(Number(w.amount))}</p><p className="break-all">{w.user_email || "Member"} · <span className="font-mono text-xs">{w.user_id}</span></p><p>Pay to UPI ID: <span className="font-semibold">{w.upi_id}</span></p><p className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleString("en-IN")}</p></div>
              <div className="space-y-2"><label htmlFor={`utr-${w.id}`} className="text-xs font-medium">Payout UTR / reference</label><Input id={`utr-${w.id}`} value={utr[w.id] ?? ""} onChange={e => setUtr(v => ({ ...v, [w.id]: e.target.value }))} maxLength={40} placeholder="Enter verified payout UTR" className="md:w-60"/><div className="flex flex-wrap gap-2"><Button variant="wallet" disabled={busy !== null || (utr[w.id] ?? "").trim().length < 6} onClick={() => act(w.id, () => payout({ data: { id: w.id, approve: true, utr: utr[w.id].trim() } }), "Withdrawal marked paid")}><Check/>Approve</Button><Button variant="destructive" disabled={busy !== null} onClick={() => act(w.id, () => payout({ data: { id: w.id, approve: false, utr: "" } }), "Withdrawal rejected and refunded")}><X/>Reject & Refund</Button></div></div>
            </article>)}
          </div>
        </section>
      </>}
    </div>
  </main>;
}

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type NoticeKind = "success" | "error" | "info";
type Notice = { id: number; kind: NoticeKind; message: string; description?: string };

const noticeEvent = "smart-wallet-notice";

function sendNotice(kind: NoticeKind, message: string, options?: { description?: string }) {
  if (typeof window === "undefined") return;
  const notice: Notice = options?.description
    ? { id: Date.now(), kind, message, description: options.description }
    : { id: Date.now(), kind, message };
  window.dispatchEvent(
    new CustomEvent<Notice>(noticeEvent, {
      detail: notice,
    }),
  );
}

export const toast = {
  success: (message: string, options?: { description?: string }) => sendNotice("success", message, options),
  error: (message: string, options?: { description?: string }) => sendNotice("error", message, options),
  info: (message: string, options?: { description?: string }) => sendNotice("info", message, options),
};

export function AppToaster() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    const handleNotice = (event: Event) => {
      const notice = (event as CustomEvent<Notice>).detail;
      setNotices((current) => [...current.slice(-2), notice]);
      window.setTimeout(
        () => setNotices((current) => current.filter((item) => item.id !== notice.id)),
        4200,
      );
    };
    window.addEventListener(noticeEvent, handleNotice);
    return () => window.removeEventListener(noticeEvent, handleNotice);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] mx-auto flex max-w-sm flex-col gap-2">
      {notices.map((notice) => {
        const Icon = notice.kind === "success" ? CheckCircle2 : notice.kind === "error" ? AlertCircle : Info;
        return (
          <div key={notice.id} role="status" className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-2xl">
            <Icon className={notice.kind === "error" ? "mt-0.5 size-5 shrink-0 text-destructive" : "mt-0.5 size-5 shrink-0 text-primary"} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{notice.message}</p>
              {notice.description && <p className="mt-1 text-xs text-muted-foreground">{notice.description}</p>}
            </div>
            <button aria-label="Dismiss notification" onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
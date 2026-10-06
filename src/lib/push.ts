/** Browser notifications shown on this device while Smart Saver is open or installed. */
export function pushSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function askPushPermission() {
  if (!pushSupported()) return "unsupported" as const;
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

export function pushLocal(title: string, body: string) {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/icon-192.png", badge: "/icon-192.png", tag: `${title}-${body}`.slice(0, 60) });
  } catch {
    /* some mobile browsers only allow notifications from a service worker */
  }
}

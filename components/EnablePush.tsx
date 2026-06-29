"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function EnablePush() {
  const [status, setStatus] = useState("");
  const [supported, setSupported] = useState(true);
  const [standalone, setStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const standaloneNow =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setStandalone(standaloneNow);
    setSupported("serviceWorker" in navigator && "PushManager" in window);
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));
  }, []);

  async function enable() {
    try {
      setStatus("Setting up…");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("Notifications permission was not granted.");
        return;
      }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        setStatus("Missing VAPID key — not configured yet.");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      setStatus(res.ok ? "Reminders enabled on this device ✓" : "Could not save subscription.");
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  }

  if (!supported) {
    return (
      <p className="text-sm text-neutral-400">
        This browser doesn’t support push notifications.
      </p>
    );
  }

  if (isIOS && !standalone) {
    return (
      <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
        On iPhone, add this app to your Home Screen first (Share → Add to Home
        Screen), then open it from there and come back to enable reminders.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={enable}
        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
      >
        Enable weekly reminders on this device
      </button>
      {status && <p className="text-sm text-neutral-500">{status}</p>}
    </div>
  );
}

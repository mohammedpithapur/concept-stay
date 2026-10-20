"use client";

import { useEffect, useState } from "react";
import { isPushSupported, isSubscribed, subscribeToPush, unsubscribeFromPush, sendTestPush, syncSubscription } from "@/lib/push";

interface Props {
  /** JWT access token from auth context */
  token: string | null;
  /** Whether to show a Test Push button when subscribed */
  showTestButton?: boolean;
  /** Custom label */
  label?: string;
}

export default function PushSubscribeButton({ token, showTestButton = false, label }: Props) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [testError, setTestError] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (!isPushSupported()) return;
    setSupported(true);
    setPermission(Notification.permission);
    isSubscribed().then((isSub) => {
      setSubscribed(isSub);
      if (isSub && token) {
        syncSubscription(token);
      }
    });
  }, [token]);

  const handleToggle = async () => {
    if (!token) return;
    setLoading(true);

    if (subscribed) {
      const ok = await unsubscribeFromPush(token);
      if (ok) setSubscribed(false);
    } else {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setLoading(false);
        return;
      }
      const ok = await subscribeToPush(token);
      if (ok) setSubscribed(true);
    }

    setLoading(false);
  };

  const handleTest = async () => {
    if (!token || testing) return;
    setTesting(true);
    setTestError(false);
    const ok = await sendTestPush(token);
    if (ok) {
      setTestSuccess(true);
      setTimeout(() => setTestSuccess(false), 3000);
    } else {
      setTestError(true);
      setTimeout(() => setTestError(false), 4000);
    }
    setTesting(false);
  };

  if (!supported) return null;

  const blocked = permission === "denied";

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <button
        onClick={handleToggle}
        disabled={loading || blocked || !token}
        title={
          blocked
            ? "Notifications blocked in browser settings"
            : subscribed
            ? "Disable push notifications"
            : "Enable push notifications"
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "7px 12px",
          borderRadius: "8px",
          border: subscribed ? "1px solid var(--color-brand)" : "1px solid var(--color-border)",
          background: subscribed ? "var(--color-bg-card)" : "#ffffff",
          color: subscribed ? "var(--color-brand)" : "var(--color-dark)",
          fontSize: "13px",
          fontWeight: 600,
          cursor: loading || blocked ? "not-allowed" : "pointer",
          opacity: blocked ? 0.5 : 1,
          transition: "all 0.2s",
          whiteSpace: "nowrap",
        }}
      >
        {loading ? (
          <LoadingSpinner />
        ) : (
          <BellIcon active={subscribed} />
        )}
        {blocked
          ? "Notifications Blocked"
          : subscribed
          ? (label ? `${label} On` : "Notifications On")
          : (label ? `Enable ${label}` : "Enable Notifications")}
      </button>

      {subscribed && showTestButton && (
        <button
          onClick={handleTest}
          disabled={testing}
          title="Send a test notification to verify your device"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "6px 10px",
            borderRadius: "6px",
            border: testError ? "1px solid #E53E3E" : "1px solid #d4cdc4",
            background: testSuccess ? "#E8F5E9" : testError ? "#FFF5F5" : "#ffffff",
            color: testSuccess ? "#2E7D32" : testError ? "#E53E3E" : "#5f574d",
            fontSize: "12px",
            fontWeight: 600,
            cursor: testing ? "not-allowed" : "pointer",
            transition: "all 0.2s",
            whiteSpace: "nowrap",
          }}
        >
          {testing ? "Sending..." : testSuccess ? "Sent" : testError ? "Failed — Re-subscribe?" : "Test Push"}
        </button>
      )}
    </div>
  );
}

function BellIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={active ? "#c9a84a" : "none"} stroke={active ? "#c9a84a" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

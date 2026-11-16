import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useBackClose } from "../utils/backClose";
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  toggleNotificationPanel,
  closeNotificationPanel,
} from "../redux/slices/notificationSlice";

const C = {
  bg: "#0B0B0C",
  surface: "#151516",
  border: "#2B2B30",
  text: "#F3EFE6",
  muted: "#8A877F",
  gold: "#C9A24B",
  unreadBg: "#C9A24B14",
  danger: "#E0574A",
};

const TYPE_ICON = {
  NEW_ORDER: "🛒",
  LOW_STOCK: "⚠️",
  NEW_REVIEW: "⭐",
  NEW_ENQUIRY: "✉️",
  PAYMENT_FAILED: "❌",
};

// How often to poll for unread count while the tab is visible. 15s was
// firing ~4x/minute continuously even when the admin had switched away
// to another tab — bumped to 45s and gated on document visibility so
// idle/background tabs stop hitting the endpoint entirely.
const POLL_INTERVAL_MS = 45000;

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationBell() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);
  const { items, unreadCount, isOpen } = useSelector((s) => s.notifications);
  const panelRef = useRef(null);

  // Poll unread count every POLL_INTERVAL_MS, but only while the tab
  // is actually visible — no reason to hit the DB while the admin has
  // switched away to another tab or app. Also re-fetches immediately
  // the moment the tab becomes visible again, so the badge doesn't sit
  // stale for up to 45s after switching back.
  useEffect(() => {
    if (!user?.token) return;

    const poll = () => {
      if (document.visibilityState === "visible") {
        dispatch(fetchUnreadCount());
      }
    };

    poll(); // initial fetch on mount

    const interval = setInterval(poll, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        dispatch(fetchUnreadCount());
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [dispatch, user?.token]);

  // Fetch the full list only when the panel opens.
  useEffect(() => {
    if (isOpen) dispatch(fetchNotifications());
  }, [isOpen, dispatch]);

  // the browser's Back closes the list (16 Nov 2026)
  useBackClose(isOpen, () => dispatch(closeNotificationPanel()));

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        dispatch(closeNotificationPanel());
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, dispatch]);

  const handleItemClick = (n) => {
    if (!n.isRead) dispatch(markNotificationRead(n._id));
    dispatch(closeNotificationPanel());
    if (n.link) navigate(n.link);
  };

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: 18,
        right: 24,
        zIndex: 60,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <button
        onClick={() => dispatch(toggleNotificationPanel())}
        style={{
          position: "relative",
          width: 42,
          height: 42,
          borderRadius: "50%",
          border: `1px solid ${C.border}`,
          background: C.surface,
          color: C.text,
          fontSize: 18,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              minWidth: 16,
              height: 16,
              borderRadius: 999,
              background: C.danger,
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: 50,
            right: 0,
            width: 340,
            maxHeight: 420,
            overflowY: "auto",
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 700,
                color: C.text,
              }}
            >
              Notifications
            </p>
            {unreadCount > 0 && (
              <button
                onClick={() => dispatch(markAllNotificationsRead())}
                style={{
                  background: "none",
                  border: "none",
                  color: C.gold,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 && (
            <p
              style={{
                padding: 20,
                fontSize: 12,
                color: C.muted,
                textAlign: "center",
              }}
            >
              No notifications yet.
            </p>
          )}

          {items.map((n) => (
            <button
              key={n._id}
              onClick={() => handleItemClick(n)}
              style={{
                display: "flex",
                gap: 10,
                width: "100%",
                textAlign: "left",
                padding: "12px 16px",
                background: n.isRead ? "transparent" : C.unreadBg,
                border: "none",
                borderBottom: `1px solid ${C.border}`,
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>
                {TYPE_ICON[n.type] || "🔔"}
              </span>
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.text,
                  }}
                >
                  {n.title}
                </p>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: 11,
                    color: C.muted,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {n.message}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 10, color: C.muted }}>
                  {timeAgo(n.createdAt)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

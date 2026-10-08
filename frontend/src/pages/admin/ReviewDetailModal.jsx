// pages/admin/ReviewDetailModal.jsx

import { useState } from "react";
import { useSelector } from "react-redux";
import { THEME } from "../../theme/theme";
import { imageUrl } from "../../utils/imageUrl";
import reviewService from "../../services/reviewServices"; // ✅ FIXED — was "reviewServices" (typo, no such file)

const REJECTION_REASONS = [
  "SPAM",
  "OFFENSIVE_LANGUAGE",
  "FAKE_REVIEW",
  "IRRELEVANT",
  "DUPLICATE",
  "OTHER",
];

export default function ReviewDetailModal({ review, onClose, onChanged }) {
  const { user } = useSelector((state) => state.auth);
  const [rejectReason, setRejectReason] = useState("SPAM");
  const [showRejectPicker, setShowRejectPicker] = useState(false);
  const [responseText, setResponseText] = useState(
    review.adminResponse?.text || "",
  );
  const [busy, setBusy] = useState(false);

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (err) {
      alert(err?.response?.data?.message || "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: THEME.surface,
          borderRadius: 14,
          padding: 28,
          width: "100%",
          maxWidth: 520,
          maxHeight: "85vh",
          overflowY: "auto",
          fontFamily: THEME.fontBody,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h3
              style={{ margin: 0, fontFamily: THEME.fontDisplay, fontSize: 20 }}
            >
              {review.user?.name}
            </h3>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 13,
                color: THEME.textMuted,
              }}
            >
              {review.product?.name}
            </p>
          </div>
          <span style={{ color: THEME.gold, fontSize: 16 }}>
            {"★".repeat(review.rating)}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            margin: "12px 0",
            flexWrap: "wrap",
          }}
        >
          {review.isVerifiedPurchase && (
            <span
              style={{
                fontSize: 11,
                background: THEME.goldBg,
                color: THEME.goldDeep,
                border: `1px solid ${THEME.goldBorder}`,
                borderRadius: 4,
                padding: "2px 8px",
              }}
            >
              Verified Purchase
            </span>
          )}
          <span style={{ fontSize: 11, color: THEME.textMuted }}>
            Order: {review.orderId}
          </span>
          <span style={{ fontSize: 11, color: THEME.textMuted }}>
            Submitted: {new Date(review.createdAt).toLocaleString()}
          </span>
        </div>

        <p style={{ fontSize: 14, color: THEME.text }}>{review.comment}</p>

        {review.photos?.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              margin: "12px 0",
            }}
          >
            {review.photos.map((src, i) => (
              <img
                key={i}
                src={imageUrl(src, 400)}
                alt=""
                style={{
                  width: 72,
                  height: 72,
                  objectFit: "cover",
                  borderRadius: 8,
                }}
              />
            ))}
          </div>
        )}

        <p style={{ fontSize: 12, color: THEME.textMuted }}>
          Current status: <strong>{review.status}</strong>
          {review.rejectionReason ? ` (${review.rejectionReason})` : ""}
        </p>

        {/* Actions */}
        <div
          style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}
        >
          <button
            disabled={busy || review.status === "APPROVED"}
            onClick={() =>
              run(() =>
                reviewService.approveReview(
                  review.productId,
                  review._id,
                  user?.token,
                ),
              )
            }
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              border: "none",
              background: "#1e7d3c",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
              opacity: review.status === "APPROVED" ? 0.5 : 1,
            }}
          >
            Approve & Publish
          </button>

          <button
            disabled={busy || review.status === "REJECTED"}
            onClick={() => setShowRejectPicker((s) => !s)}
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              border: "1px solid #c0392b",
              background: "transparent",
              color: "#c0392b",
              fontWeight: 600,
              cursor: "pointer",
              opacity: review.status === "REJECTED" ? 0.5 : 1,
            }}
          >
            Reject
          </button>

          <button
            disabled={busy || review.status !== "APPROVED"}
            onClick={() =>
              run(() =>
                reviewService.toggleFeaturedReview(
                  review.productId,
                  review._id,
                  user?.token,
                ),
              )
            }
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              border: `1px solid ${THEME.goldBorder}`,
              background: review.isFeatured ? THEME.goldBg : "transparent",
              color: THEME.goldDeep,
              fontWeight: 600,
              cursor: "pointer",
              opacity: review.status !== "APPROVED" ? 0.5 : 1,
            }}
          >
            {review.isFeatured ? "★ Featured" : "Mark as Featured"}
          </button>
        </div>

        {showRejectPicker && (
          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <select
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${THEME.border}`,
              }}
            >
              {REJECTION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r.replace("_", " ").toLowerCase()}
                </option>
              ))}
            </select>
            <button
              disabled={busy}
              onClick={() =>
                run(() =>
                  reviewService.rejectReview(
                    review.productId,
                    review._id,
                    rejectReason,
                    user?.token,
                  ),
                )
              }
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "none",
                background: "#c0392b",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Confirm Reject
            </button>
          </div>
        )}

        {/* Admin response */}
        <div style={{ marginTop: 22 }}>
          <label
            style={{ fontSize: 12, fontWeight: 600, color: THEME.textMuted }}
          >
            Reply to customer
          </label>
          <textarea
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            rows={3}
            placeholder="Thank you so much for your feedback! ❤️"
            style={{
              width: "100%",
              marginTop: 6,
              padding: 10,
              borderRadius: 8,
              border: `1px solid ${THEME.border}`,
              fontFamily: THEME.fontBody,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
          <button
            disabled={busy || !responseText.trim()}
            onClick={() =>
              run(() =>
                reviewService.respondToReview(
                  review.productId,
                  review._id,
                  responseText,
                  user?.token,
                ),
              )
            }
            style={{
              marginTop: 8,
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: THEME.goldDeep,
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Save Response
          </button>
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 22,
            width: "100%",
            padding: "9px 0",
            borderRadius: 8,
            border: `1px solid ${THEME.border}`,
            background: "transparent",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

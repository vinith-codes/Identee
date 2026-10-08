// components/WriteReviewModal.jsx
//
// Usage (e.g. in OrderSuccessPage.jsx / MyOrdersPage.jsx, per delivered item):
//
//   <WriteReviewModal
//     open={showModal}
//     onClose={() => setShowModal(false)}
//     productId={item.product}
//     productName={item.name}
//     productImage={item.image}
//     orderId={order._id}
//     onSubmitted={() => refreshEligibility()}
//   />

import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { THEME } from "../theme/theme";
import reviewService from "../services/reviewServices";
import { imageUrl } from "../utils/imageUrl";


function getImageUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return imageUrl(path.replace(/^\/+/, ""));
}

function StarPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          onClick={() => onChange(star)}
          style={{
            cursor: "pointer",
            fontSize: 30,
            color: star <= value ? THEME.gold : THEME.border,
            lineHeight: 1,
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

const MAX_PHOTOS = 5;

export default function WriteReviewModal({
  open,
  onClose,
  productId,
  productName,
  productImage,
  orderId,
  onSubmitted,
}) {
  const { user } = useSelector((state) => state.auth);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [recommend, setRecommend] = useState(true);
  const [images, setImages] = useState([]); // File[]
  const [previews, setPreviews] = useState([]); // objectURL[]
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Build/clean up object URLs for the selected photos whenever the
  // selection changes — this powers the thumbnail preview grid.
  useEffect(() => {
    const urls = images.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [images]);

  // Reset form state each time the modal is (re)opened for a new item.
  useEffect(() => {
    if (open) {
      setRating(0);
      setComment("");
      setRecommend(true);
      setImages([]);
      setError("");
      setSuccess(false);
    }
  }, [open, productId, orderId]);

  if (!open) return null;

  const handleFilesSelected = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    const combined = [...images, ...selected].slice(0, MAX_PHOTOS);
    setImages(combined);
    e.target.value = ""; // allow re-selecting the same file if removed
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setError("");

    if (!rating) return setError("Please select a star rating");
    if (!comment.trim() || comment.trim().length < 3)
      return setError("Please write a short review");

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("rating", rating);
      formData.append("comment", comment.trim());
      formData.append("orderId", orderId);
      formData.append("recommend", recommend);
      images.forEach((file) => formData.append("images", file));

      await reviewService.submitReview(productId, formData, user?.token);

      setSuccess(true);
      onSubmitted?.();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to submit review");
    } finally {
      setSubmitting(false);
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
          maxWidth: 480,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: THEME.shadow,
          fontFamily: THEME.fontBody,
        }}
      >
        {success ? (
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <p style={{ fontSize: 40, margin: 0 }}>✅</p>
            <h3
              style={{
                margin: "12px 0 4px",
                fontFamily: THEME.fontDisplay,
                fontSize: 18,
                color: THEME.text,
              }}
            >
              Review submitted
            </h3>
            <p style={{ fontSize: 13, color: THEME.textMuted, margin: 0 }}>
              It'll appear on the product page once approved by our team.
            </p>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              {productImage && (
                <img
                  src={getImageUrl(productImage)}
                  alt={productName}
                  style={{
                    width: 48,
                    height: 48,
                    objectFit: "cover",
                    borderRadius: 8,
                    border: `1px solid ${THEME.border}`,
                  }}
                />
              )}
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontFamily: THEME.fontDisplay,
                    fontSize: 18,
                    color: THEME.text,
                  }}
                >
                  Write a Review
                </h3>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: 13,
                    color: THEME.textMuted,
                  }}
                >
                  {productName}
                </p>
              </div>
            </div>

            <label
              style={{ fontSize: 12, fontWeight: 600, color: THEME.textMuted }}
            >
              Your rating
            </label>
            <div style={{ margin: "6px 0 18px" }}>
              <StarPicker value={rating} onChange={setRating} />
            </div>

            <label
              style={{ fontSize: 12, fontWeight: 600, color: THEME.textMuted }}
            >
              Your review
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="Tell other customers about the fit, fabric, and quality..."
              style={{
                width: "100%",
                marginTop: 6,
                padding: 10,
                borderRadius: 8,
                border: `1px solid ${THEME.border}`,
                fontFamily: THEME.fontBody,
                fontSize: 14,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />

            {/* ── Photo attachment + preview ── */}
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: THEME.textMuted,
                display: "block",
                marginTop: 16,
              }}
            >
              Photos (optional, up to {MAX_PHOTOS})
            </label>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 8,
              }}
            >
              {previews.map((url, i) => (
                <div
                  key={url}
                  style={{
                    position: "relative",
                    width: 72,
                    height: 72,
                    borderRadius: 8,
                    overflow: "hidden",
                    border: `1px solid ${THEME.border}`,
                  }}
                >
                  <img
                    src={url}
                    alt={`Attachment ${i + 1}`}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: "none",
                      background: "rgba(0,0,0,0.65)",
                      color: "#fff",
                      fontSize: 11,
                      lineHeight: 1,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </div>
              ))}

              {images.length < MAX_PHOTOS && (
                <label
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 8,
                    border: `1px dashed ${THEME.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: THEME.textMuted,
                    fontSize: 22,
                    fontWeight: 300,
                  }}
                >
                  +
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFilesSelected}
                    style={{ display: "none" }}
                  />
                </label>
              )}
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 18,
                fontSize: 13,
                color: THEME.text,
              }}
            >
              <input
                type="checkbox"
                checked={recommend}
                onChange={(e) => setRecommend(e.target.checked)}
              />
              I recommend this product
            </label>

            {error && (
              <p style={{ color: "#c0392b", fontSize: 13, marginTop: 12 }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 8,
                  border: `1px solid ${THEME.border}`,
                  background: "transparent",
                  color: THEME.text,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 8,
                  border: "none",
                  background: THEME.goldDeep,
                  color: "#fff",
                  fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "Submitting..." : "Submit Review"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// components/ProductReviews.jsx
import { THEME } from "../theme/theme";
import { imageUrl } from "../utils/imageUrl";
function Stars({ value, size = 16 }) {
  return (
    <span style={{ color: THEME.gold, fontSize: size, letterSpacing: 1 }}>
      {"★".repeat(Math.round(value))}
      <span style={{ color: THEME.border }}>
        {"★".repeat(5 - Math.round(value))}
      </span>
    </span>
  );
}

function RatingBar({ star, count, total }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
    >
      <span style={{ width: 24, color: THEME.textMuted }}>{star}★</span>
      <div
        style={{
          flex: 1,
          height: 8,
          borderRadius: 4,
          background: THEME.border,
          overflow: "hidden",
        }}
      >
        <div
          style={{ width: `${pct}%`, height: "100%", background: THEME.gold }}
        />
      </div>
      <span style={{ width: 28, color: THEME.textMuted, textAlign: "right" }}>
        {count}
      </span>
    </div>
  );
}

export default function ProductReviews({ product }) {
  const reviews = product?.reviews || [];
  const breakdown = product?.ratingBreakdown || {
    5: 0,
    4: 0,
    3: 0,
    2: 0,
    1: 0,
  };
  const total = product?.numReviews ?? reviews.length;
  const avg = product?.rating || 0;

  return (
    <section style={{ fontFamily: THEME.fontBody, marginTop: 40 }}>
      <h2
        style={{
          fontFamily: THEME.fontDisplay,
          fontSize: 22,
          color: THEME.text,
          marginBottom: 20,
        }}
      >
        Customer Reviews
      </h2>

      <div
        style={{ display: "flex", gap: 40, flexWrap: "wrap", marginBottom: 32 }}
      >
        <div style={{ textAlign: "center", minWidth: 140 }}>
          <p
            style={{
              fontSize: 40,
              fontWeight: 700,
              margin: 0,
              color: THEME.text,
            }}
          >
            {avg.toFixed(1)}
          </p>
          <Stars value={avg} size={18} />
          <p style={{ fontSize: 13, color: THEME.textMuted, marginTop: 6 }}>
            Based on {total} review{total === 1 ? "" : "s"}
          </p>
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 220,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {[5, 4, 3, 2, 1].map((star) => (
            <RatingBar
              key={star}
              star={star}
              count={breakdown[star] || 0}
              total={total}
            />
          ))}
        </div>
      </div>

      {reviews.length === 0 ? (
        <p style={{ color: THEME.textMuted, fontSize: 14 }}>
          No reviews yet. Be the first to review this product.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {reviews.map((r) => (
            <div
              key={r._id}
              style={{
                borderBottom: `1px solid ${THEME.border}`,
                paddingBottom: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <strong style={{ fontSize: 14, color: THEME.text }}>
                      {r.user?.name || r.name}
                    </strong>
                    {r.isVerifiedPurchase && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          background: THEME.goldBg,
                          color: THEME.goldDeep,
                          border: `1px solid ${THEME.goldBorder}`,
                          borderRadius: 4,
                          padding: "2px 6px",
                        }}
                      >
                        Verified Purchase
                      </span>
                    )}
                  </div>
                  <Stars value={r.rating} />
                </div>
                <span style={{ fontSize: 12, color: THEME.textMuted }}>
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>

              <p style={{ fontSize: 14, color: THEME.text, margin: "10px 0" }}>
                {r.comment}
              </p>

              {r.recommend && (
                <p
                  style={{
                    fontSize: 12,
                    color: THEME.goldDeep,
                    margin: "0 0 10px",
                  }}
                >
                  ✓ Recommends this product
                </p>
              )}

              {r.photos?.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 10,
                  }}
                >
                  {r.photos.map((src, i) => (
                    <img
                      key={i}
                      src={imageUrl(src, 400)}
                      alt="Review"
                      style={{
                        width: 64,
                        height: 64,
                        objectFit: "cover",
                        borderRadius: 8,
                      }}
                    />
                  ))}
                </div>
              )}

              {r.adminResponse && (
                <div
                  style={{
                    background: THEME.goldBg,
                    border: `1px solid ${THEME.goldBorder}`,
                    borderRadius: 8,
                    padding: 12,
                    marginTop: 8,
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: THEME.goldDeep,
                      margin: 0,
                    }}
                  >
                    IDENTEE Team
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      color: THEME.text,
                      margin: "4px 0 0",
                    }}
                  >
                    {r.adminResponse.text}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// pages/admin/AdminReviewsPage.jsx
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import reviewService from "../../services/reviewServices";
import ReviewDetailModal from "./ReviewDetailModal";
import { THEME } from "../../theme/theme";

function StatCard({ label, value, theme }) {
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: "16px 20px",
        flex: 1,
        minWidth: 140,
        boxShadow: theme.shadow,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: theme.textMuted,
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "6px 0 0",
          fontSize: 26,
          fontWeight: 600,
          color: theme.goldDeep,
          fontFamily: theme.fontDisplay,
        }}
      >
        {value}
      </p>
    </div>
  );
}

const STATUS_PILL = {
  PENDING: { bg: "#fff4e0", color: "#b8860b" },
  APPROVED: { bg: "#e6f7ec", color: "#1e7d3c" },
  REJECTED: { bg: "#fdecea", color: "#c0392b" },
};

function StatusPill({ status }) {
  const s = STATUS_PILL[status] || STATUS_PILL.PENDING;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: 20,
        background: s.bg,
        color: s.color,
        textTransform: "capitalize",
      }}
    >
      {status.toLowerCase()}
    </span>
  );
}

export default function AdminReviewsPage() {
  const { user } = useSelector((state) => state.auth);
  const theme = THEME; // fixed palette (there is no theme switcher)
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("");
  const [search, setSearch] = useState("");
  const [activeReview, setActiveReview] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== "all") params.status = statusFilter;
      if (ratingFilter) params.rating = ratingFilter;
      if (search) params.search = search;

      const data = await reviewService.getAllReviews(params, user?.token);
      setStats(
        data.stats || { total: 0, pending: 0, approved: 0, rejected: 0 },
      );
      setReviews(data.reviews || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, ratingFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    load();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.bg,
        padding: "32px 40px",
        fontFamily: theme.fontBody,
      }}
    >
      <h1
        style={{
          fontFamily: theme.fontDisplay,
          fontSize: 26,
          color: theme.text,
          marginBottom: 20,
        }}
      >
        Reviews
      </h1>

      <div
        style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 28 }}
      >
        <StatCard label="Total Reviews" value={stats.total} theme={theme} />
        <StatCard label="Pending" value={stats.pending} theme={theme} />
        <StatCard label="Approved" value={stats.approved} theme={theme} />
        <StatCard label="Rejected" value={stats.rejected} theme={theme} />
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 20,
          alignItems: "center",
        }}
      >
        {["all", "PENDING", "APPROVED", "REJECTED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: `1px solid ${statusFilter === s ? theme.goldDeep : theme.border}`,
              background: statusFilter === s ? theme.goldBg : "transparent",
              color: statusFilter === s ? theme.goldDeep : theme.text,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {s.toLowerCase()}
          </button>
        ))}

        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
          }}
        >
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {r} star
            </option>
          ))}
        </select>

        <form
          onSubmit={handleSearchSubmit}
          style={{ marginLeft: "auto", display: "flex", gap: 8 }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reviews, customer, product..."
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              minWidth: 240,
            }}
          />
          <button
            type="submit"
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: "none",
              background: theme.goldDeep,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </form>
      </div>

      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ background: theme.goldBg, textAlign: "left" }}>
              {[
                "Customer",
                "Product",
                "Rating",
                "Review",
                "Status",
                "Date",
                "",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 14px",
                    color: theme.goldDeep,
                    fontWeight: 700,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: 20,
                    textAlign: "center",
                    color: theme.textMuted,
                  }}
                >
                  Loading...
                </td>
              </tr>
            ) : reviews.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: 20,
                    textAlign: "center",
                    color: theme.textMuted,
                  }}
                >
                  No reviews found
                </td>
              </tr>
            ) : (
              reviews.map((r) => (
                <tr
                  key={r._id}
                  style={{ borderTop: `1px solid ${theme.border}` }}
                >
                  <td style={{ padding: "10px 14px" }}>{r.user?.name}</td>
                  <td style={{ padding: "10px 14px" }}>{r.product?.name}</td>
                  <td style={{ padding: "10px 14px", color: theme.gold }}>
                    {"★".repeat(r.rating)}
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      maxWidth: 260,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.comment}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <StatusPill status={r.status} />
                  </td>
                  <td style={{ padding: "10px 14px", color: theme.textMuted }}>
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <button
                      onClick={() => setActiveReview(r)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 6,
                        border: `1px solid ${theme.goldBorder}`,
                        background: "transparent",
                        color: theme.goldDeep,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {activeReview && (
        <ReviewDetailModal
          review={activeReview}
          onClose={() => setActiveReview(null)}
          onChanged={() => {
            setActiveReview(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// Route this at: <Route path="/favorites" element={<FavoritesPage />} />

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { imageUrl } from "../utils/imageUrl";
import EmptyState from "../components/EmptyState";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const C = { bg: "#FFFFFF", ink: "#15130F", muted: "#71695B", border: "#ECE4D2" };

export default function FavoritesPage() {
  const { user } = useSelector((s) => s.auth);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  // a failed load says so and offers Try again (it used to look like "No favourites yet")
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setFailed(false);
    fetch(`${BACKEND_URL}/api/users/getfavorites`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Couldn't load your favourites");
        return res.json();
      })
      .then((data) => alive && setFavorites(Array.isArray(data) ? data : []))
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user, reloadKey]);

  if (!user) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.muted }}>
        Please log in to view your favorites.
      </div>
    );
  }
  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Loading…</div>;
  }
  if (failed) {
    return (
      <div role="alert" style={{ padding: 40, textAlign: "center", color: C.muted }}>
        <p style={{ margin: "0 0 14px", color: C.ink, fontWeight: 600 }}>We couldn’t load your favourites.</p>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} style={{ border: 0, borderRadius: 999, padding: "10px 22px", background: C.ink, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          Try again
        </button>
      </div>
    );
  }
  if (favorites.length === 0) {
    return (
      <EmptyState first="shop" title="No favourites yet" text="Tap the heart on any tee to keep it here for later." />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "40px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.ink, marginBottom: 24 }}>
          My Favorites
        </h1>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 20,
          }}
        >
          {favorites.map((p) => (
            <Link
              key={p._id}
              to={`/product/${p._id}`}
              style={{ textDecoration: "none", color: C.ink }}
            >
              <div
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {p.images?.[0] && (
                  <img
                    src={imageUrl(p.images[0])}
                    alt={p.brandname}
                    style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover" }}
                  />
                )}
                <div style={{ padding: 12 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{p.brandname}</p>
                  <p style={{ margin: "4px 0 0", fontWeight: 700 }}>₹ {p.price}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
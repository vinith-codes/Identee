// /test-visit?code=…  — the shop side of Admin → Design Studio → Test as a customer (5 Nov 2026).
// The admin website opens this page with a one-time code; the server swaps it for a login marked testMode, which the
// shop keeps even though it is a team account (authSlice / authService let a testMode login stay). Then the shop
// shows its "Test mode" band (Navbar → TestModeBand) and every order placed is a test order.
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { setCredentials } from "../redux/slices/authSlice";
import { adminHref } from "../utils/siteUrls";
import { THEME } from "../theme/theme";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function TestVisitPage() {
  const [params] = useSearchParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [error, setError] = useState(() => (params.get("code") ? "" : "This link has no test code. Go to the admin website → Design Studio → Test as a customer."));

  useEffect(() => {
    const code = params.get("code");
    if (!code) return;
    let alive = true;
    axios
      .post(`${BACKEND_URL}/api/users/test-visit/claim`, { code })
      .then(({ data }) => {
        if (!alive) return;
        localStorage.setItem("userInfo", JSON.stringify(data));
        dispatch(setCredentials(data));
        window.dispatchEvent(new Event("storage")); // the Navbar reads localStorage
        navigate("/", { replace: true });
      })
      .catch((e) => alive && setError(e.response?.data?.message || "Couldn't start test mode. Please try again from the admin website."));
    return () => {
      alive = false;
    };
  }, [params, dispatch, navigate]);

  return (
    <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24, fontFamily: THEME.fontBody, color: THEME.text }}>
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        {error ? (
          <>
            <h1 style={{ fontSize: 20, fontFamily: THEME.fontDisplay, margin: "0 0 10px" }}>Test mode didn't start</h1>
            <p style={{ margin: "0 0 16px", color: THEME.textMuted, fontSize: 14, lineHeight: 1.5 }}>{error}</p>
            <a href={adminHref("/admin/test-mode")} style={{ color: THEME.goldDeep, fontWeight: 600 }}>Back to the admin website</a>
            <span style={{ color: THEME.textFaint }}> · </span>
            <Link to="/" style={{ color: THEME.goldDeep, fontWeight: 600 }}>Go to the shop</Link>
          </>
        ) : (
          <p style={{ margin: 0, color: THEME.textMuted, fontSize: 14 }}>Starting test mode…</p>
        )}
      </div>
    </main>
  );
}

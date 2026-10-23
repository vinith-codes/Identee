// components/MaintenanceGate.jsx — the shop while Admin → Settings → General → Maintenance Mode is on (23 Oct 2026).
// The server already answers the shop's requests with 503 then (middleware/maintenanceMiddleware.js); without this
// page customers saw a half-empty shop. Now every page shows "We'll be back soon", with the Notify me box (it keeps
// working during maintenance) and the shop's phone and email. The admin website is not affected.
import { useEffect, useState } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { fetchPublicSettings } from "../redux/slices/publicSettingsSlice";
import waitlistService from "../services/waitlistService";
import { useBrandLogo } from "../utils/brandLogo";
import logo from "../assets/identee-logo.png";

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function MaintenanceGate({ children }) {
  const dispatch = useDispatch();
  const { values, isLoaded } = useSelector((s) => s.publicSettings);
  const [blocked, setBlocked] = useState(false); // a request was turned away for maintenance (switched on meanwhile)
  useEffect(() => {
    if (!isLoaded) dispatch(fetchPublicSettings());
  }, [isLoaded, dispatch]);
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 503 && /maintenance/i.test(err.response?.data?.message || "")) setBlocked(true);
        return Promise.reject(err);
      },
    );
    return () => axios.interceptors.response.eject(id);
  }, []);
  if (blocked || values["general.maintenanceMode"] === true) return <MaintenancePage settings={values} />;
  return children;
}

function MaintenancePage({ settings }) {
  const brandLogo = useBrandLogo(logo, 320);
  const [email, setEmail] = useState("");
  const [state, setState] = useState({ sending: false, done: false, error: "" });
  const phone = settings["general.phoneNumber"];
  const mail = settings["general.storeEmail"] || settings["general.supportEmail"];
  useEffect(() => {
    document.title = "IDENTEE · Back soon";
  }, []);
  const submit = async (e) => {
    e.preventDefault();
    const v = email.trim();
    if (!EMAIL_RX.test(v)) return setState({ sending: false, done: false, error: "Enter a valid email address" });
    setState({ sending: true, done: false, error: "" });
    try {
      await waitlistService.join(v);
      setState({ sending: false, done: true, error: "" });
    } catch (err) {
      setState({ sending: false, done: false, error: err.response?.data?.message || "Couldn't save it just now. Please try again." });
    }
  };
  return (
    <main className="mx-page">
      <style>{MX_CSS}</style>
      <div className="mx-card">
        {brandLogo && <img className="mx-logo" src={brandLogo} alt="IDENTEE" />}
        <p className="mx-eyebrow">Back soon</p>
        <h1>We’re making a few improvements</h1>
        <p className="mx-lead">The IDENTEE shop is closed for a short while for maintenance. Please check back soon. Your saved designs and orders are safe.</p>
        {state.done ? (
          <p className="mx-done" role="status">
            Thank you. We’ll email you as soon as the shop is open again.
          </p>
        ) : (
          <form className="mx-form" onSubmit={submit} noValidate>
            <label htmlFor="mx-email">Tell me when it’s back</label>
            <div className="mx-row">
              <input id="mx-email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={state.error ? "true" : undefined} />
              <button type="submit" disabled={state.sending}>
                {state.sending ? "Saving…" : "Notify me"}
              </button>
            </div>
            {state.error && <p className="mx-error">{state.error}</p>}
          </form>
        )}
        {(phone || mail) && (
          <p className="mx-contact">
            Need help with an order?{phone && <> Call <a href={`tel:${phone}`}>{phone}</a></>}
            {phone && mail && " or"}
            {mail && <> email <a href={`mailto:${mail}`}>{mail}</a></>}.
          </p>
        )}
      </div>
    </main>
  );
}

const MX_CSS = `
.mx-page { min-height: 100vh; min-height: 100dvh; display: grid; place-items: center; padding: 24px 16px; box-sizing: border-box;
  background: #F1ECE1; color: #141110; font-family: "Inter", "Helvetica Neue", Arial, sans-serif; }
.mx-card { width: min(480px, 100%); box-sizing: border-box; display: grid; gap: 14px; padding: 32px 26px; border-radius: 22px;
  background: #FBF8F1; border: 1px solid #E2D8C3; box-shadow: 0 30px 60px -30px rgba(20, 17, 16, .35); text-align: center; }
.mx-logo { justify-self: center; width: 96px; height: 96px; object-fit: contain; }
.mx-eyebrow { margin: 6px 0 0; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #8C6A1F; }
.mx-card h1 { margin: 0; font-family: "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; font-size: clamp(24px, 6vw, 30px); line-height: 1.15; text-wrap: balance; }
.mx-lead { margin: 0; font-size: 15px; line-height: 1.6; color: #3B342B; }
.mx-form { display: grid; gap: 8px; margin-top: 6px; text-align: left; }
.mx-form label { font-size: 13px; font-weight: 700; }
.mx-row { display: flex; gap: 8px; }
.mx-row input { flex: 1; min-width: 0; min-height: 46px; padding: 0 14px; border: 1px solid #D7CCB3; border-radius: 12px; font: inherit; font-size: 16px; background: #fff; color: #141110; }
.mx-row input:focus { outline: 2px solid #C9A24B; outline-offset: 1px; }
.mx-row button { flex: none; min-height: 46px; padding: 0 18px; border: 0; border-radius: 12px; background: #141110; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
.mx-row button:disabled { opacity: .6; cursor: default; }
.mx-error { margin: 0; font-size: 13px; color: #A3341F; }
.mx-done { margin: 6px 0 0; padding: 12px 14px; border-radius: 12px; background: #E4F1E8; color: #1F5E38; font-weight: 600; font-size: 14px; }
.mx-contact { margin: 6px 0 0; font-size: 13px; line-height: 1.55; color: #7A7062; }
.mx-contact a { color: #8C6A1F; font-weight: 600; }
@media (max-width: 380px) { .mx-row { flex-direction: column; } .mx-card { padding: 26px 18px; } }
`;

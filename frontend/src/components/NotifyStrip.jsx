// The thin "We're under development · Notify me" strip at the very top of every customer page (22 Oct 2026): a
// visitor leaves an email and the team tells them when the new designs are here (Admin → Customers → Notify me
// list). On/off and its words: Admin → Settings → General → "Notify me strip". Hidden in the design room (it has
// its own top bar) and on the login page, which have no Navbar.
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import waitlistService from "../services/waitlistService";

const JOINED_KEY = "identee:notifyJoined";
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TEXT = "We're under development · new designs coming soon";

const css = `
  .nfs { position: relative; z-index: 120; background: #FBF3DF; color: #5A4410; border-bottom: 1px solid #EBDDB5; font: 500 12.5px/1.35 Inter, "Helvetica Neue", Arial, sans-serif; }
  .nfs-row { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 34px; padding: 4px 14px; text-align: center; }
  .nfs-text .short { display: none; }
  .nfs-btn { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 12px; border-radius: 999px; border: 0; background: #15130F; color: #F0D585; font: 600 12px/1 Inter, "Helvetica Neue", Arial, sans-serif; cursor: pointer; white-space: nowrap; flex: none; }
  .nfs-btn:hover { background: #2A2620; }
  .nfs-btn:focus-visible, .nfs-x:focus-visible, .nfs-send:focus-visible { outline: 2px solid #B8912F; outline-offset: 2px; }
  .nfs-btn svg { width: 13px; height: 13px; }
  .nfs-on { display: inline-flex; align-items: center; gap: 5px; color: #27500A; font-weight: 600; white-space: nowrap; }
  .nfs-anchor { position: relative; display: inline-flex; flex: none; }
  .nfs-pop { position: absolute; top: calc(100% + 10px); right: -8px; width: 330px; max-width: calc(100vw - 28px); box-sizing: border-box; background: #fff; color: #15130F; border: 1px solid #E7E1D3; border-radius: 14px; padding: 14px; text-align: left; box-shadow: 0 10px 30px rgba(20,17,16,.14); }
  .nfs-pop p { margin: 0 28px 10px 0; color: #6B6559; font-size: 13px; line-height: 1.5; font-weight: 400; }
  .nfs-pop label { display: block; margin: 0 0 6px; font-size: 12px; font-weight: 600; color: #15130F; }
  .nfs-form { display: flex; gap: 8px; }
  .nfs-form input { flex: 1; min-width: 0; height: 40px; box-sizing: border-box; border: 1px solid #D9D3C4; border-radius: 999px; padding: 0 14px; font: 400 16px/1 Inter, "Helvetica Neue", Arial, sans-serif; color: #15130F; background: #fff; }
  .nfs-form input:focus { outline: none; border-color: #B8912F; box-shadow: 0 0 0 3px rgba(184,145,47,.18); }
  .nfs-send { height: 40px; padding: 0 16px; border: 0; border-radius: 999px; background: #15130F; color: #fff; font: 600 13px/1 Inter, "Helvetica Neue", Arial, sans-serif; cursor: pointer; white-space: nowrap; }
  .nfs-send:disabled { opacity: .6; cursor: wait; }
  .nfs-pop .nfs-err { margin: 6px 2px 0; color: #A32D2D; font-size: 12.5px; }
  .nfs-done { display: flex; gap: 8px; align-items: flex-start; color: #27500A; background: #EAF3DE; border-radius: 10px; padding: 10px 12px; margin-right: 28px; font-size: 13px; line-height: 1.45; }
  .nfs-x { position: absolute; top: 8px; right: 8px; width: 30px; height: 30px; border: 0; border-radius: 50%; background: transparent; color: #6B6559; font-size: 20px; line-height: 1; cursor: pointer; }
  .nfs-x:hover { background: #F3F1EC; }
  @media (max-width: 600px) {
    .nfs { font-size: 12px; }
    .nfs-row { gap: 8px; padding: 4px 10px; }
    .nfs-text .long { display: none; }
    .nfs-text .short { display: inline; }
    .nfs-anchor { position: static; }
    .nfs-pop { top: calc(100% + 6px); right: 10px; left: 10px; width: auto; max-width: none; }
  }
`;

const Bell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

const readJoined = () => {
  try {
    return localStorage.getItem(JOINED_KEY) === "1";
  } catch {
    return false;
  }
};

export default function NotifyStrip({ user }) {
  const { values: settings, isLoaded } = useSelector((s) => s.publicSettings);
  const [joined, setJoined] = useState(readJoined);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  // close on Escape or a click outside the box
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onDown = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      clearTimeout(t);
    };
  }, [open]);

  // the setting loads with the page: nothing shows until it is known, so the strip never flashes and vanishes
  if (!isLoaded || settings["general.notifyStrip"] === false) return null;
  const text = String(settings["general.notifyStripText"] || "").trim() || DEFAULT_TEXT;

  const start = () => {
    setEmail((v) => v || user?.email || "");
    setError("");
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const v = email.trim();
    if (!EMAIL_RX.test(v)) {
      setError("Enter a valid email address");
      return;
    }
    setSending(true);
    setError("");
    try {
      await waitlistService.join(v, user?.token);
      try {
        localStorage.setItem(JOINED_KEY, "1");
      } catch {
        /* private window: the strip just asks again next time */
      }
      setDone(true);
      setJoined(true);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't save it just now. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="nfs" ref={boxRef} role="region" aria-label="Notify me">
      <style>{css}</style>
      <div className="nfs-row">
        <span className="nfs-text">
          <span className="long">{text}</span>
          <span className="short">We're under development</span>
        </span>
        <span className="nfs-anchor">
          {joined && !open ? (
            <span className="nfs-on">✓ You're on the list</span>
          ) : (
            <button type="button" className="nfs-btn" onClick={() => (open ? setOpen(false) : start())} aria-expanded={open} aria-controls="nfs-pop">
              <Bell />
              Notify me
            </button>
          )}

          {open && (
            <div className="nfs-pop" id="nfs-pop">
              <button type="button" className="nfs-x" onClick={() => setOpen(false)} aria-label="Close">×</button>
              {done ? (
                <div className="nfs-done" role="status">
                  <span aria-hidden="true">✓</span>
                  <span>You're on the list. We'll email {email.trim()} the day the new designs arrive.</span>
                </div>
              ) : (
                <form onSubmit={submit} noValidate>
                  <p>We're still building new designs. Leave your email and we'll tell you the day they arrive. One email, no spam.</p>
                  <label htmlFor="nfs-email">Your email</label>
                  <div className="nfs-form">
                    <input
                      id="nfs-email"
                      ref={inputRef}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="name@gmail.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError("");
                      }}
                    />
                    <button type="submit" className="nfs-send" disabled={sending}>
                      {sending ? "Saving…" : "Notify me"}
                    </button>
                  </div>
                  {error && <p className="nfs-err" role="alert">{error}</p>}
                </form>
              )}
            </div>
          )}
        </span>
      </div>
    </div>
  );
}

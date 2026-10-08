import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDispatch } from "react-redux";
import authService from "../services/authService";
import { setCredentials } from "../redux/slices/authSlice";

const gold = "#C9A24B";
const goldBright = "#F0D585";

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mirrors normalizeIdentifier on the server (10-digit Indian mobile, optional +91/0).
const PHONE_RX = /^(?:\+?91|0)?[6-9]\d{9}$/;

// Phone login is built but off until an SMS provider is set up (see server
// PHONE_LOGIN_ENABLED). Set VITE_PHONE_LOGIN=true to show it.
const PHONE_LOGIN = import.meta.env.VITE_PHONE_LOGIN === "true";
const ID_LABEL = PHONE_LOGIN ? "Email or mobile number" : "Email address";
const ID_ERROR = PHONE_LOGIN
  ? "Enter a valid email address or 10-digit mobile number."
  : "Enter a valid email address.";

const isValidIdentifier = (value) => {
  const v = value.trim();
  if (!PHONE_LOGIN) return EMAIL_RX.test(v);
  return v.includes("@")
    ? EMAIL_RX.test(v)
    : PHONE_RX.test(v.replace(/[\s\-()]/g, ""));
};

const apiError = (err) =>
  err.response?.data?.message || err.message || "Something went wrong";

const inputStyle = (hasError) => ({
  background: "#1F1F24",
  color: "#F3EFE6",
  borderColor: hasError ? "#E2574C" : "#3A3A40",
});

const Label = ({ children }) => (
  <label
    className="block text-xs font-medium uppercase tracking-wider mb-1.5"
    style={{ color: "#8A877F" }}
  >
    {children}
  </label>
);

const ErrorText = ({ children }) =>
  children ? (
    <p className="text-xs mt-1" style={{ color: "#E2574C" }}>
      {children}
    </p>
  ) : null;

const PrimaryButton = ({ onClick, loading, children, loadingText }) => (
  <button
    onClick={onClick}
    disabled={loading}
    className="w-full py-2.5 text-sm font-medium rounded-lg transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
    style={{
      background: `linear-gradient(135deg, ${gold}, ${goldBright})`,
      color: "#0B0B0C",
    }}
  >
    {loading ? (
      <span className="flex items-center justify-center gap-2">
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8z"
          />
        </svg>
        {loadingText}
      </span>
    ) : (
      children
    )}
  </button>
);

// Steps: "identifier" -> "otp" -> ("profile" for new users only)
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const [step, setStep] = useState("identifier");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [signupToken, setSignupToken] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ show: false, msg: "" });

  const otpRef = useRef(null);
  const nameRef = useRef(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (step === "otp") otpRef.current?.focus();
    if (step === "profile") nameRef.current?.focus();
  }, [step]);

  const showToast = (msg) => {
    setToast({ show: true, msg });
    setTimeout(() => setToast({ show: false, msg: "" }), 3000);
  };

  const finishLogin = (user) => {
    dispatch(setCredentials(user));
    window.dispatchEvent(new Event("storage")); // Navbar reads localStorage
    showToast(`Welcome, ${user.name}!`);

    const from = location.state?.from;
    setTimeout(() => {
      if (user.isAdmin) navigate("/admin/dashboard", { replace: true });
      else if (user.isSeller) navigate("/seller/dashboard", { replace: true });
      else navigate(from || "/", { replace: true });
    }, 600);
  };

  const sendCode = async () => {
    if (!isValidIdentifier(identifier)) {
      setError(ID_ERROR);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await authService.requestOtp(identifier.trim());
      setSentTo(data.message);
      setResendIn(data.resendAfter || 30);
      setOtp("");
      setStep("otp");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await authService.verifyOtp(identifier.trim(), otp);
      if (data.needsProfile) {
        setSignupToken(data.signupToken);
        setStep("profile");
      } else {
        finishLogin(data);
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  const createAccount = async () => {
    if (name.trim().length < 2) {
      setError("Please enter your name.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const user = await authService.completeSignup(signupToken, name.trim());
      finishLogin(user);
    } catch (err) {
      const msg = apiError(err);
      // Signup token expired — start over.
      if (err.response?.status === 401) {
        setStep("identifier");
        setOtp("");
        setSignupToken("");
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const changeIdentifier = () => {
    setStep("identifier");
    setOtp("");
    setError("");
  };

  const onEnter = (action) => (e) => {
    if (e.key === "Enter") action();
  };

  const headings = {
    identifier: ["Welcome", `Log in or sign up with your ${ID_LABEL.toLowerCase()}`],
    otp: ["Enter the code", sentTo],
    profile: ["Almost there", "Tell us your name to finish creating your account"],
  };

  return (
    <div
      className="min-h-screen flex font-sans"
      style={{ background: "#0B0B0C" }}
    >
      {/* Left Panel */}
      <div
        className="hidden md:flex w-5/12 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "#101012" }}
      >
        <div
          className="absolute -top-16 -right-16 w-56 h-56 rounded-full"
          style={{ border: `40px solid ${gold}0d` }}
        />
        <div
          className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full"
          style={{ border: `30px solid ${gold}0d` }}
        />

        <div className="flex items-center gap-3 z-10">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center font-serif font-bold"
            style={{
              background: `linear-gradient(135deg, ${gold}, ${goldBright})`,
              color: "#0B0B0C",
            }}
          >
            ID
          </div>
          <span
            className="text-xl font-semibold tracking-tight"
            style={{ color: "#F3EFE6" }}
          >
            IDENTEE
          </span>
        </div>

        <div className="z-10">
          <p
            className="text-3xl leading-snug font-light italic opacity-90"
            style={{
              color: "#F3EFE6",
              fontFamily: "'Cormorant Garamond', serif",
            }}
          >
            Your style, your story,
            <br />
            your{" "}
            <span
              className="not-italic font-semibold"
              style={{ color: goldBright }}
            >
              identity.
            </span>
          </p>
          <p
            className="text-sm mt-4 leading-relaxed"
            style={{ color: "#8A877F" }}
          >
            Sign in to manage orders, designs,
            <br />
            and your custom collection.
          </p>
        </div>

        <div className="flex gap-10 z-10">
          {[
            ["24k+", "Orders"],
            ["1.2k", "Sellers"],
            ["98%", "Uptime"],
          ].map(([val, label]) => (
            <div key={label}>
              <p className="text-xl font-semibold" style={{ color: "#F3EFE6" }}>
                {val}
              </p>
              <p
                className="text-xs uppercase tracking-wider mt-1"
                style={{ color: "#8A877F" }}
              >
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 md:hidden">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
              style={{
                background: `linear-gradient(135deg, ${gold}, ${goldBright})`,
                color: "#0B0B0C",
              }}
            >
              ID
            </div>
            <span
              className="text-lg font-semibold tracking-tight"
              style={{ color: "#F3EFE6" }}
            >
              IDENTEE
            </span>
          </div>

          <h2
            className="text-2xl font-semibold mb-1"
            style={{
              color: "#F3EFE6",
              fontFamily: "'Cormorant Garamond', serif",
            }}
          >
            {headings[step][0]}
          </h2>
          <p className="text-sm mb-8" style={{ color: "#8A877F" }}>
            {headings[step][1]}
          </p>

          {step === "identifier" && (
            <>
              <div className="mb-6">
                <Label>{ID_LABEL}</Label>
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onKeyDown={onEnter(sendCode)}
                  type={PHONE_LOGIN ? "text" : "email"}
                  placeholder={
                    PHONE_LOGIN ? "you@example.com or 98765 43210" : "you@example.com"
                  }
                  autoComplete="username"
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition-all"
                  style={inputStyle(!!error)}
                />
                <ErrorText>{error}</ErrorText>
              </div>
              <PrimaryButton
                onClick={sendCode}
                loading={loading}
                loadingText="Sending code…"
              >
                Continue
              </PrimaryButton>
              <p
                className="text-xs text-center mt-6 leading-relaxed"
                style={{ color: "#5A5852" }}
              >
                New to IDENTEE? We'll create your account after you verify
                the code.
              </p>
            </>
          )}

          {step === "otp" && (
            <>
              <div className="mb-6">
                <div className="flex justify-between items-baseline">
                  <Label>6-digit code</Label>
                  <button
                    type="button"
                    onClick={changeIdentifier}
                    className="text-xs hover:underline mb-1.5"
                    style={{ color: goldBright }}
                  >
                    Change
                  </button>
                </div>
                <input
                  ref={otpRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={onEnter(verifyCode)}
                  placeholder="••••••"
                  className="w-full px-3.5 py-2.5 rounded-lg border text-lg tracking-[0.5em] text-center outline-none transition-all"
                  style={inputStyle(!!error)}
                />
                <ErrorText>{error}</ErrorText>
                <div className="flex justify-end mt-2">
                  {resendIn > 0 ? (
                    <span className="text-xs" style={{ color: "#5A5852" }}>
                      Resend code in {resendIn}s
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={sendCode}
                      disabled={loading}
                      className="text-xs hover:underline disabled:opacity-60"
                      style={{ color: goldBright }}
                    >
                      Resend code
                    </button>
                  )}
                </div>
              </div>
              <PrimaryButton
                onClick={verifyCode}
                loading={loading}
                loadingText="Verifying…"
              >
                Verify & continue
              </PrimaryButton>
            </>
          )}

          {step === "profile" && (
            <>
              <div className="mb-6">
                <Label>Your name</Label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={onEnter(createAccount)}
                  placeholder="Full name"
                  autoComplete="name"
                  maxLength={50}
                  className="w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition-all"
                  style={inputStyle(!!error)}
                />
                <ErrorText>{error}</ErrorText>
              </div>
              <PrimaryButton
                onClick={createAccount}
                loading={loading}
                loadingText="Creating account…"
              >
                Create account
              </PrimaryButton>
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      <div
        className={`fixed top-5 right-5 text-sm px-4 py-3 rounded-xl shadow-lg transition-all duration-300 z-50 max-w-xs
          ${toast.show ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}`}
        style={{
          background: "#16161A",
          border: `1px solid ${gold}44`,
          color: "#F3EFE6",
        }}
      >
        {toast.msg}
      </div>
    </div>
  );
}

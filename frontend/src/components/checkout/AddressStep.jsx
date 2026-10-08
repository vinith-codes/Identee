import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { THEME, inputStyle, labelStyle } from "../../theme/theme";
import { validateAddress, isValidAddress } from "../../utils/address";
import usePincodeAutofill from "../../utils/usePincodeAutofill";
import { UseLocationButton } from "../AddressAutofill";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const emptyAddress = {
  doorNo: "",
  street: "",
  nearestLandmark: "",
  city: "",
  state: "",
  pin: "",
  phoneNumber: "",
  isDefault: false,
};

const Field = ({ label, children }) => (
  <div>
    <label style={labelStyle}>{label}</label>
    <div style={{ marginTop: 5 }}>{children}</div>
  </div>
);

function formatAddress(addr) {
  return [
    addr.doorNo,
    addr.street,
    addr.nearestLandmark,
    addr.city,
    addr.state,
    addr.pin,
  ]
    .filter(Boolean)
    .join(", ");
}

export default function AddressStep({ selectedAddress, onContinue }) {
  const { user } = useSelector((state) => state.auth);

  const [addresses, setAddresses] = useState([]);
  const [selected, setSelected] = useState(selectedAddress || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("view"); // "view" | "choose" | "add"
  const [form, setForm] = useState(emptyAddress);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Live shipping rules — the single source of truth for which states are
  // deliverable. Powers both the "Add mode" state <select> and the
  // deliverability check on already-saved addresses below.
  const [shippingRules, setShippingRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(true);

  useEffect(() => {
    const fetchShippingRules = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/shipping/getshippingcost`);
        if (!res.ok) return;
        const data = await res.json();
        setShippingRules(
          Array.isArray(data.shippingRules) ? data.shippingRules : [],
        );
      } catch (err) {
        console.error("Failed to load shipping states:", err);
      } finally {
        setRulesLoading(false);
      }
    };
    fetchShippingRules();
  }, []);

  // True only if the address's state exactly matches one of the current
  // shipping rules (case/whitespace-insensitive). Addresses saved before
  // the state <select> existed may have a typo'd or unsupported state —
  // this catches those before the user reaches payment and hits a 400.
  const deliverableStates = shippingRules.map((r) => r.state);
  const isDeliverable = (addr) =>
    isValidAddress(addr || {}, deliverableStates);

  // Merge autofilled fields into the new-address form.
  const fillForm = (fields) => setForm((f) => ({ ...f, ...fields }));
  const pinHint = usePincodeAutofill(
    form.pin,
    form.city,
    deliverableStates,
    fillForm,
  );

  useEffect(() => {
    const fetchAddresses = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/users/profile`, {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (!res.ok) throw new Error("Could not load your saved addresses");
        const data = await res.json();
        const list = Array.isArray(data.addresses) ? data.addresses : [];
        setAddresses(list);

        if (!selectedAddress) {
          const def = list.find((a) => a.isDefault) || list[0];
          if (def) setSelected(def);
          else setMode("add");
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validate = () => {
    const errs = validateAddress(form, deliverableStates);
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSaveNewAddress = async () => {
    if (!validate()) return;
    setSaving(true);
    setError("");
    try {
      const cleaned = {
        ...form,
        pin: Number(form.pin),
        phoneNumber: Number(form.phoneNumber),
      };
      let nextAddresses = [...addresses, cleaned];
      if (cleaned.isDefault || addresses.length === 0) {
        nextAddresses = nextAddresses.map((a) => ({
          ...a,
          isDefault: a === cleaned,
        }));
      }

      const fd = new FormData();
      fd.append("addresses", JSON.stringify(nextAddresses));
      const res = await fetch(`${BACKEND_URL}/api/users/profile`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${user.token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not save address");

      const savedList = data.addresses || nextAddresses;
      setAddresses(savedList);
      const newAddr = savedList[savedList.length - 1];
      setSelected(newAddr);
      setForm(emptyAddress);
      setMode("view");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <p style={{ color: THEME.textMuted, fontFamily: THEME.fontBody }}>
        Loading your address…
      </p>
    );
  }

  const selectedIsDeliverable = selected ? isDeliverable(selected) : true;

  return (
    <div>
      <div
        style={{
          background: THEME.surface,
          border: `1px solid ${THEME.border}`,
          borderRadius: 12,
          padding: 28,
          boxShadow: THEME.shadow,
        }}
      >
        <h2
          style={{
            margin: "0 0 20px",
            fontSize: 18,
            fontWeight: 600,
            fontFamily: THEME.fontDisplay,
            color: THEME.text,
          }}
        >
          Deliver To
        </h2>

        {error && (
          <p
            style={{
              color: THEME.danger,
              fontSize: 13,
              marginBottom: 16,
              fontFamily: THEME.fontBody,
            }}
          >
            {error}
          </p>
        )}

        {/* ── View mode: selected address card, Flipkart-style ── */}
        {mode === "view" && selected && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                background: selectedIsDeliverable ? THEME.goldBg : "#FFF3F0",
                border: `1px solid ${selectedIsDeliverable ? THEME.goldBorder : THEME.dangerBorder}`,
                borderRadius: 10,
                padding: 18,
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontWeight: 700,
                    fontSize: 14,
                    color: THEME.text,
                    fontFamily: THEME.fontBody,
                  }}
                >
                  {user?.name}{" "}
                  {selected.isDefault && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: THEME.goldDeep,
                        background: THEME.surface,
                        border: `1px solid ${THEME.goldBorder}`,
                        padding: "2px 6px",
                        borderRadius: 4,
                        marginLeft: 6,
                      }}
                    >
                      HOME
                    </span>
                  )}
                </p>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 13,
                    color: THEME.textMuted,
                    fontFamily: THEME.fontBody,
                    maxWidth: 380,
                  }}
                >
                  {formatAddress(selected)}
                </p>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 13,
                    color: THEME.textMuted,
                    fontFamily: THEME.fontBody,
                  }}
                >
                  📞 {selected.phoneNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMode("choose")}
                style={{
                  background: "none",
                  border: `1px solid ${THEME.gold}`,
                  color: THEME.goldDeep,
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: THEME.fontBody,
                  whiteSpace: "nowrap",
                }}
              >
                Change
              </button>
            </div>

            {!rulesLoading && !selectedIsDeliverable && (
              <p
                style={{
                  color: THEME.danger,
                  fontSize: 12,
                  marginTop: 10,
                  fontFamily: THEME.fontBody,
                }}
              >
                ⚠ This address can't be used: either we don't deliver to "
                {selected.state || "this state"}" or its city, PIN or phone
                number is invalid. Please choose another address or add a new
                one.
              </p>
            )}
          </div>
        )}

        {/* ── Choose mode: pick from saved addresses ── */}
        {mode === "choose" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {addresses.map((addr, i) => {
              const deliverable = isDeliverable(addr);
              return (
                <label
                  key={i}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    border: `1.5px solid ${
                      selected === addr
                        ? deliverable
                          ? THEME.gold
                          : THEME.dangerBorder
                        : THEME.border
                    }`,
                    background:
                      selected === addr ? THEME.goldBg : THEME.surface,
                    borderRadius: 10,
                    padding: 14,
                    cursor: "pointer",
                    opacity: deliverable ? 1 : 0.85,
                  }}
                >
                  <input
                    type="radio"
                    checked={selected === addr}
                    onChange={() => setSelected(addr)}
                    style={{ marginTop: 4, accentColor: THEME.gold }}
                  />
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 600,
                        fontSize: 13,
                        color: THEME.text,
                        fontFamily: THEME.fontBody,
                      }}
                    >
                      {addr.isDefault ? "HOME · " : ""}
                      {formatAddress(addr)}
                    </p>
                    <p
                      style={{
                        margin: "3px 0 0",
                        fontSize: 12,
                        color: THEME.textMuted,
                        fontFamily: THEME.fontBody,
                      }}
                    >
                      📞 {addr.phoneNumber}
                    </p>
                    {!rulesLoading && !deliverable && (
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: 11,
                          color: THEME.danger,
                          fontFamily: THEME.fontBody,
                        }}
                      >
                        ⚠ Not deliverable — "{addr.state || "no state"}" isn't a
                        supported state
                      </p>
                    )}
                  </div>
                </label>
              );
            })}

            <button
              type="button"
              onClick={() => setMode("add")}
              style={{
                border: `1px dashed ${THEME.gold}`,
                background: "transparent",
                color: THEME.goldDeep,
                borderRadius: 8,
                padding: "10px 0",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: THEME.fontBody,
              }}
            >
              + Add New Address
            </button>

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}
            >
              <button
                type="button"
                onClick={() => setMode("view")}
                style={{
                  padding: "9px 18px",
                  borderRadius: 8,
                  border: `1px solid ${THEME.border}`,
                  background: THEME.surface,
                  color: THEME.textMuted,
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: THEME.fontBody,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setMode("view")}
                disabled={
                  !selected || (!rulesLoading && !isDeliverable(selected))
                }
                title={
                  selected && !rulesLoading && !isDeliverable(selected)
                    ? "This address isn't deliverable — pick another or add a new one"
                    : undefined
                }
                style={{
                  padding: "9px 18px",
                  borderRadius: 8,
                  border: "none",
                  background:
                    selected && (rulesLoading || isDeliverable(selected))
                      ? `linear-gradient(135deg, ${THEME.gold}, ${THEME.goldBright})`
                      : THEME.border,
                  color:
                    selected && (rulesLoading || isDeliverable(selected))
                      ? "#0B0B0C"
                      : THEME.textMuted,
                  cursor:
                    selected && (rulesLoading || isDeliverable(selected))
                      ? "pointer"
                      : "not-allowed",
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: THEME.fontBody,
                }}
              >
                Use This Address
              </button>
            </div>
          </div>
        )}

        {/* ── Add mode: inline new-address form ── */}
        {mode === "add" && (
          <div>
            <UseLocationButton
              deliverableStates={deliverableStates}
              onFill={fillForm}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
                marginBottom: 14,
              }}
            >
              <Field label="Door / House No. *">
                <input
                  value={form.doorNo}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, doorNo: e.target.value }))
                  }
                  style={inputStyle}
                />
                {formErrors.doorNo && (
                  <p
                    style={{
                      color: THEME.danger,
                      fontSize: 11,
                      margin: "3px 0 0",
                    }}
                  >
                    {formErrors.doorNo}
                  </p>
                )}
              </Field>
              <Field label="Street Name *">
                <input
                  value={form.street}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, street: e.target.value }))
                  }
                  style={inputStyle}
                />
                {formErrors.street && (
                  <p
                    style={{
                      color: THEME.danger,
                      fontSize: 11,
                      margin: "3px 0 0",
                    }}
                  >
                    {formErrors.street}
                  </p>
                )}
              </Field>
            </div>

            <div style={{ marginBottom: 14 }}>
              <Field label="Nearest Landmark (optional)">
                <input
                  value={form.nearestLandmark}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nearestLandmark: e.target.value }))
                  }
                  style={inputStyle}
                />
              </Field>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 14,
                marginBottom: 14,
              }}
            >
              <Field label="City *">
                <input
                  value={form.city}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, city: e.target.value }))
                  }
                  style={inputStyle}
                />
                {formErrors.city && (
                  <p
                    style={{
                      color: THEME.danger,
                      fontSize: 11,
                      margin: "3px 0 0",
                    }}
                  >
                    {formErrors.city}
                  </p>
                )}
              </Field>

              <Field label="State *">
                {rulesLoading ? (
                  <input
                    value="Loading states…"
                    disabled
                    style={{ ...inputStyle, color: THEME.textMuted }}
                  />
                ) : shippingRules.length > 0 ? (
                  <select
                    value={form.state}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, state: e.target.value }))
                    }
                    style={inputStyle}
                  >
                    <option value="">Select state…</option>
                    {shippingRules.map((rule) => (
                      <option key={rule._id || rule.state} value={rule.state}>
                        {rule.state} (₹{rule.cost} delivery)
                      </option>
                    ))}
                  </select>
                ) : (
                  // Fallback only if no shipping rules are configured at
                  // all yet — the order will still be rejected at payment
                  // time until an admin adds at least one state.
                  <input
                    value={form.state}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, state: e.target.value }))
                    }
                    placeholder="e.g. Tamil Nadu"
                    style={inputStyle}
                  />
                )}
                {formErrors.state && (
                  <p
                    style={{
                      color: THEME.danger,
                      fontSize: 11,
                      margin: "3px 0 0",
                    }}
                  >
                    {formErrors.state}
                  </p>
                )}
              </Field>

              <Field label="Pincode *">
                <input
                  value={form.pin}
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      pin: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                  placeholder="6-digit PIN — fills city & state"
                  style={inputStyle}
                />
                {pinHint && !formErrors.pin && (
                  <p
                    style={{
                      color: THEME.textMuted,
                      fontSize: 11,
                      margin: "3px 0 0",
                    }}
                  >
                    {pinHint}
                  </p>
                )}
                {formErrors.pin && (
                  <p
                    style={{
                      color: THEME.danger,
                      fontSize: 11,
                      margin: "3px 0 0",
                    }}
                  >
                    {formErrors.pin}
                  </p>
                )}
              </Field>
            </div>

            <div style={{ marginBottom: 14 }}>
              <Field label="Phone Number *">
                <input
                  value={form.phoneNumber}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      phoneNumber: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                  placeholder="10-digit mobile number"
                  style={inputStyle}
                />
                {formErrors.phoneNumber && (
                  <p
                    style={{
                      color: THEME.danger,
                      fontSize: 11,
                      margin: "3px 0 0",
                    }}
                  >
                    {formErrors.phoneNumber}
                  </p>
                )}
              </Field>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                color: THEME.text,
                marginBottom: 18,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isDefault: e.target.checked }))
                }
                style={{ accentColor: THEME.gold }}
              />
              Set as default address
            </label>

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}
            >
              {addresses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMode("choose")}
                  style={{
                    padding: "9px 18px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.border}`,
                    background: THEME.surface,
                    color: THEME.textMuted,
                    cursor: "pointer",
                    fontSize: 13,
                    fontFamily: THEME.fontBody,
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveNewAddress}
                disabled={saving}
                style={{
                  padding: "9px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: saving
                    ? "#8A6F2E"
                    : `linear-gradient(135deg, ${THEME.gold}, ${THEME.goldBright})`,
                  color: "#0B0B0C",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: THEME.fontBody,
                }}
              >
                {saving ? "Saving…" : "Save & Use This Address"}
              </button>
            </div>
          </div>
        )}
      </div>

      {mode === "view" && selected && (
        <div
          style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}
        >
          <button
            type="button"
            onClick={() => onContinue(selected)}
            disabled={!rulesLoading && !selectedIsDeliverable}
            title={
              !rulesLoading && !selectedIsDeliverable
                ? "This address isn't deliverable — tap Change to pick or add another"
                : undefined
            }
            style={{
              padding: "11px 32px",
              borderRadius: 8,
              border: "none",
              background:
                rulesLoading || selectedIsDeliverable
                  ? `linear-gradient(135deg, ${THEME.gold}, ${THEME.goldBright})`
                  : THEME.border,
              color:
                rulesLoading || selectedIsDeliverable
                  ? "#0B0B0C"
                  : THEME.textMuted,
              cursor:
                rulesLoading || selectedIsDeliverable
                  ? "pointer"
                  : "not-allowed",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: THEME.fontBody,
            }}
          >
            Continue to Order Summary →
          </button>
        </div>
      )}
    </div>
  );
}

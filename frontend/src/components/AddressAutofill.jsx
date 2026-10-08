import { useState } from "react";
import { THEME } from "../theme/theme";
import {
  addressFromCurrentLocation,
  matchDeliverableState,
} from "../utils/address";

// "📍 Use my current location" — fills the address form from GPS.
// onFill receives only the fields that were found; existing values for
// missing fields are kept by the caller's merge.
export function UseLocationButton({ deliverableStates, onFill }) {
  const [status, setStatus] = useState({ loading: false, msg: "", error: false });

  const handleClick = async () => {
    setStatus({ loading: true, msg: "Finding your location…", error: false });
    try {
      const found = await addressFromCurrentLocation();
      const state = matchDeliverableState(found.state, deliverableStates);
      const filled = Object.fromEntries(
        Object.entries({ ...found, state }).filter(([, v]) => v),
      );
      onFill(filled);
      setStatus({
        loading: false,
        error: !state,
        msg: !state && found.state
          ? `We don't deliver to ${found.state} yet.`
          : "Address filled from your location — please check it and add your door / house number.",
      });
    } catch (err) {
      setStatus({ loading: false, msg: err.message, error: true });
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={status.loading}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 14px",
          borderRadius: 8,
          border: `1px solid ${THEME.gold}`,
          background: THEME.goldBg,
          color: THEME.goldDeep,
          fontSize: 13,
          fontWeight: 700,
          fontFamily: THEME.fontBody,
          cursor: status.loading ? "wait" : "pointer",
          opacity: status.loading ? 0.7 : 1,
        }}
      >
        📍 {status.loading ? "Locating…" : "Use my current location"}
      </button>
      {status.msg && !status.loading && (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 12,
            color: status.error ? THEME.danger : THEME.textMuted,
            fontFamily: THEME.fontBody,
          }}
        >
          {status.msg}
        </p>
      )}
    </div>
  );
}

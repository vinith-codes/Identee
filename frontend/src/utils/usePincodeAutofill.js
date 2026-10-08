import { useEffect, useState } from "react";
import { lookupPincode, matchDeliverableState } from "./address";

// When a full 6-digit PIN is typed, fills city + state (only if the user
// hasn't typed a city yet, so we never overwrite their own input).
export default function usePincodeAutofill(pin, currentCity, deliverableStates, onFill) {
  const [hint, setHint] = useState({ pin: "", text: "" });
  const value = String(pin || "").trim();

  useEffect(() => {
    if (!/^\d{6}$/.test(value)) return;
    let cancelled = false;
    lookupPincode(value).then((found) => {
      if (cancelled) return;
      if (!found) {
        setHint({ pin: value, text: "PIN not found — please check it" });
        return;
      }
      const state = matchDeliverableState(found.state, deliverableStates);
      setHint({
        pin: value,
        text: state
          ? `${found.city}, ${found.state}`
          : `We don't deliver to ${found.state} yet`,
      });
      // onFill must use a functional state update (it may be a stale closure).
      onFill({
        ...(String(currentCity || "").trim() ? {} : { city: found.city }),
        ...(state ? { state } : {}),
      });
    });
    return () => {
      cancelled = true;
    };
    // Only re-run when the PIN changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Hide a hint that belongs to a different (edited) PIN.
  return hint.pin === value ? hint.text : "";
}

// Holds "this admin page has unsaved changes" for the whole admin area — see utils/unsavedChanges.js.
import { useCallback, useEffect, useMemo, useState } from "react";
import { UnsavedChangesContext } from "../utils/unsavedChanges";

export default function UnsavedChangesProvider({ children }) {
  const [dirty, setDirty] = useState(false);
  const [what, setWhat] = useState("");
  const report = useCallback((d, w) => {
    setDirty(d);
    setWhat(d ? w || "" : "");
  }, []);
  const confirmLeave = useCallback(
    () => !dirty || window.confirm(`You have unsaved changes${what ? ` in ${what}` : ""}.\n\nLeave without saving?`),
    [dirty, what],
  );
  // reload / close the tab
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const value = useMemo(() => ({ dirty, report, confirmLeave }), [dirty, report, confirmLeave]);
  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>;
}

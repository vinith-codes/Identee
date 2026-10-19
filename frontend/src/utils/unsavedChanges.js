// Unsaved changes in the admin: a page says when it has some (useReportUnsaved), and anything that would
// leave the page — the sidebar, the settings tabs, a Back link — asks first (confirmLeave). Reloading or
// closing the tab asks too. The provider lives in layouts/UnsavedChangesProvider.jsx (AdminLayout).
import { createContext, useContext, useEffect } from "react";

export const UnsavedChangesContext = createContext({ dirty: false, report: () => {}, confirmLeave: () => true });

export const useUnsavedChanges = () => useContext(UnsavedChangesContext);

// A page reports its own unsaved state (cleared when the page unmounts).
export function useReportUnsaved(dirty, what = "") {
  const { report } = useContext(UnsavedChangesContext);
  useEffect(() => {
    report(Boolean(dirty), what);
    return () => report(false, "");
  }, [dirty, what, report]);
}

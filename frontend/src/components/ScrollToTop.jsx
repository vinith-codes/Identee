// A new page starts at its top (clicking "Names & numbers" low on the home page opened the team page at its
// bottom). Going back / forward (POP) keeps the place the browser restores, and a link to #section is left alone.
import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const type = useNavigationType();
  useEffect(() => {
    if (type === "POP" || hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash, type]);
  return null;
}

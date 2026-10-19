// A new page starts at its top (clicking "Names & numbers" low on the home page opened the team page at its
// bottom). Going back / forward (POP) keeps the place the browser restores, and a link to #section is left alone.
// useLayoutEffect: the scroll moves BEFORE the new page is painted — with useEffect the browser first drew the
// new page at the old scroll position (its footer) and then jumped, a flash that could show both at once.
import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const type = useNavigationType();
  useLayoutEffect(() => {
    if (type === "POP" || hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash, type]);
  return null;
}

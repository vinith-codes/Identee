// The store logo and favicon set in Admin → Settings → General.
// When nothing is uploaded there, each place keeps its own built-in file.
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchPublicSettings } from "../redux/slices/publicSettingsSlice";
import { imageUrl } from "./imageUrl";

function useBrandSetting(key) {
  const dispatch = useDispatch();
  const { values, isLoaded } = useSelector((s) => s.publicSettings);
  useEffect(() => {
    if (!isLoaded) dispatch(fetchPublicSettings());
  }, [isLoaded, dispatch]);
  return { value: String(values?.[key] || "").trim(), isLoaded };
}

// A General setting's text (e.g. the invoice's authorised signatory), or the fallback until it is set.
export function useStoreText(key, fallback = "") {
  const { value } = useBrandSetting(key);
  return value || fallback;
}

// null until the settings arrive, so the built-in logo doesn't flash before an uploaded one.
export function useBrandLogo(fallback, width = 400) {
  const { value, isLoaded } = useBrandSetting("general.storeLogo");
  if (value) return imageUrl(value, width);
  return isLoaded ? fallback : null;
}

// Puts the uploaded favicon on the browser tab (index.html's /favicon.png otherwise).
export function BrandFavicon() {
  const { value } = useBrandSetting("general.favicon");
  useEffect(() => {
    const link = document.querySelector("link[rel~='icon']");
    if (!link) return;
    if (!link.dataset.builtIn) link.dataset.builtIn = link.getAttribute("href") || "";
    if (value) {
      link.removeAttribute("type"); // the browser reads the upload's own type
      link.setAttribute("href", imageUrl(value, 64));
    } else {
      link.setAttribute("type", "image/png");
      link.setAttribute("href", link.dataset.builtIn);
    }
  }, [value]);
  return null;
}

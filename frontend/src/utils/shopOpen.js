// Is "Shop your IDENTEE" (ready-made products) open? Admin → Settings → General → "Shop your IDENTEE is open".
// Off (also before the setting exists) = Coming soon: the shop, its categories and product pages show
// components/ShopComingSoon.jsx, and checkout refuses ready-made items (server/services/checkoutService.js).
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchPublicSettings } from "../redux/slices/publicSettingsSlice";

/** @returns {{ open: boolean, known: boolean }} known = the settings have loaded */
export function useShopOpen() {
  const dispatch = useDispatch();
  const { values = {}, isLoaded } = useSelector((s) => s.publicSettings);
  useEffect(() => {
    if (!isLoaded) dispatch(fetchPublicSettings());
  }, [dispatch, isLoaded]);
  return { open: values["general.shopOpen"] === true, known: isLoaded };
}

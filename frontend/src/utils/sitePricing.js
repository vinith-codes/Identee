// utils/sitePricing.js — what the shop shows around prices (launch, 16 Oct 2026):
// the coupon set to show on the site (Admin → Offers) and the flat shipping rule (Admin → Shipping).
import { useEffect, useState } from "react";
import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// the coupon shown next to prices: fetched once per page load ({ code, offerPercentage } or null)
let offerOnce = null;
const fetchSiteOffer = () => {
  if (!offerOnce) {
    offerOnce = axios
      .get(`${BACKEND_URL}/api/offers/on-site`)
      .then((r) => r.data || null)
      .catch(() => null);
  }
  return offerOnce;
};
export function useSiteOffer() {
  const [offer, setOffer] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchSiteOffer().then((o) => alive && setOffer(o));
    return () => {
      alive = false;
    };
  }, []);
  return offer;
}

// the shipping rule: { rate, freeFrom } (₹100, free from 3 pieces), or null when the state costs are used
let shipOnce = null;
export function useShippingRule() {
  const [rule, setRule] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!shipOnce) {
      shipOnce = axios
        .get(`${BACKEND_URL}/api/shipping/getshippingcost`)
        .then((r) => (r.data?.flatRate === null || r.data?.flatRate === undefined ? null : { rate: Number(r.data.flatRate), freeFrom: Number(r.data.freeFromPieces) || 3 }))
        .catch(() => null);
    }
    shipOnce.then((r) => alive && setRule(r));
    return () => {
      alive = false;
    };
  }, []);
  return rule;
}

// "Free shipping" / "₹100 shipping · add 2 more pieces for free shipping" for this many pieces
export const shippingNote = (rule, pieces) => {
  if (!rule || !pieces) return "";
  if (pieces >= rule.freeFrom) return "Free shipping";
  const more = rule.freeFrom - pieces;
  return `₹${rule.rate} shipping · add ${more} more piece${more === 1 ? "" : "s"} for free shipping`;
};

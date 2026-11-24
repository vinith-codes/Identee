// utils/useTrend.js — the trend a Shop your IDENTEE collection belongs to (23 Nov 2026: the GTA tees, "GTA · …", are
// the "gta" trend's collection; components/shop/TrendPhotoBox.jsx).
import { useEffect, useState } from "react";
import aiService from "../services/aiService";

/** The trend a collection belongs to ("gta" → the GTA style trend), or null (not a trend's collection / switched off). */
export default function useTrend(key) {
  const [trend, setTrend] = useState(null);
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    aiService
      .trends()
      .then((r) => alive && setTrend((r?.trends || []).find((t) => t.key === key) || null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);
  return key ? trend : null;
}


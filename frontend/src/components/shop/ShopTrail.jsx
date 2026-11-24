// components/shop/ShopTrail.jsx — "where am I" in Shop your IDENTEE (24 Nov 2026)
//
// The owner: "think as a user and implement proper navigation in shop your identee".
//   Crumbs            Home › Shop your IDENTEE › Ayyappa › Oversized — every step but the last is a link
//   CollectionSwitch  a chip per collection (SCENE 51 · GTA 75 · Ayyappa 114): go from one to another in one tap,
//                     without going back to the shop's start page first
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import shopService from "../../services/shopService";
import { collectionInfo, collectionLink } from "../../utils/shopRules";
import { imageUrl } from "../../utils/imageUrl";
import "./shopTrail.css";

const imageSmall = (src) => imageUrl(src, 96); // a tiny round picture for a collection's chip

// the shop's collections, asked once per visit (every shop page needs them)
let asked = null;
function useShopCollections() {
  const [list, setList] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!asked) {
      asked = shopService.listProducts({ limit: 1 }).then((d) => d.facets?.collections || []);
      asked.catch(() => {
        asked = null; // try again on the next page
      });
    }
    asked.then((c) => alive && setList(c)).catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, []);
  return list;
}

// items: [{ label, to, onClick }] — the last one is where you are
export function Crumbs({ items, dark = false, className = "" }) {
  return (
    <nav aria-label="Breadcrumb" className={`st-crumbs${dark ? " dark" : ""} ${className}`}>
      <ol>
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${it.label}-${i}`} className={it.wide ? "st-wide" : undefined}>
              {last || !it.to ? (
                <span aria-current={last ? "page" : undefined}>{it.label}</span>
              ) : (
                <Link to={it.to} onClick={it.onClick}>
                  {it.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// a chip per collection; the one you are in is marked. Hidden while the shop has only one collection.
export function CollectionSwitch({ current = "", dark = false }) {
  const list = useShopCollections();
  if (!list || list.length < 2) return null;
  return (
    <nav aria-label="Collections" className={`st-switch${dark ? " dark" : ""}`}>
      <span className="st-switch-label">Collections</span>
      <ul>
        {list.map((c) => {
          const on = c.key === current;
          return (
            <li key={c.key}>
              <Link to={collectionLink(c.key)} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
                {c.photos?.[0] && <img src={imageSmall(c.photos[0])} alt="" loading="lazy" />}
                {collectionInfo(c.key, c.name).name}
                <small>{c.count}</small>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

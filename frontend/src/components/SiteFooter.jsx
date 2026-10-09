// components/SiteFooter.jsx — the footer on every customer page
// (added once in App.jsx's CustomerLayout).
//
// Only real links: the shop's pages, the live ready-made categories
// (Admin → Storefront → Categories) and the customer's own pages.
// Contact details, address and social links come from Admin → Settings;
// anything not filled in there is simply left out.
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchCategories } from "../redux/slices/categorySlice";
import { fetchPublicSettings } from "../redux/slices/publicSettingsSlice";

const CSS = `
  .sf { background: #fff; color: #15130F; font-family: "Inter", "Helvetica Neue", Arial, sans-serif; border-top: 1px solid #E2DED3; }
  .sf a { color: inherit; text-decoration: none; }
  .sf-wrap { max-width: 1280px; margin: 0 auto; padding-inline: 24px; }
  .sf-contact { background: #F1F0EC; padding-block: 44px; }
  .sf-contact h2 { margin: 0; font: 700 clamp(24px, 3vw, 34px)/1.1 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; letter-spacing: -0.02em; }
  .sf-contact p { margin: 8px 0 0; color: #6F6A60; font-size: 15px; }
  .sf-ways { display: flex; flex-wrap: wrap; gap: 12px 34px; margin-top: 22px; }
  .sf-ways a { display: inline-flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 500; }
  .sf-ways a:hover { text-decoration: underline; text-underline-offset: 4px; }
  .sf-ways svg { width: 18px; height: 18px; flex-shrink: 0; }
  .sf-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 1.3fr); gap: 32px; padding-block: 52px 56px; }
  .sf-col h3 { margin: 0 0 16px; font: 700 11.5px/1 "Inter", sans-serif; letter-spacing: .2em; text-transform: uppercase; color: #6F6A60; }
  .sf-col ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 11px; }
  .sf-col li a { font-size: 14.5px; color: #3B362E; transition: color .2s; }
  .sf-col li a:hover { color: #15130F; text-decoration: underline; text-underline-offset: 4px; }
  .sf-col address { font-style: normal; font-size: 14px; line-height: 1.6; color: #3B362E; white-space: pre-line; }
  .sf-map { margin-top: 14px; border-radius: 14px; overflow: hidden; border: 1px solid #E2DED3; height: 170px; }
  .sf-map iframe { width: 100%; height: 100%; border: 0; display: block; }
  .sf-social { display: flex; gap: 10px; margin-top: 16px; }
  .sf-social a { width: 38px; height: 38px; border-radius: 50%; border: 1px solid #D8D2C4; display: grid; place-items: center; transition: background .2s, color .2s; }
  .sf-social a:hover { background: #15130F; color: #fff; }
  .sf-social svg { width: 17px; height: 17px; }
  .sf-bottom { border-top: 1px solid #E2DED3; padding-block: 18px; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: #6F6A60; }
  .sf a:focus-visible { outline: 2px solid #B8912F; outline-offset: 3px; border-radius: 4px; }
  @media (max-width: 900px) { .sf-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 520px) { .sf-grid { grid-template-columns: minmax(0, 1fr); gap: 28px; } }
`;

const Icon = {
  mail: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>,
  phone: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>,
  whatsapp: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19.1z" /><path d="M9 9.5c.3 1.8 1.7 3.4 3.5 4.2l1.2-1 1.8.8c-.2 1-1 1.6-2 1.6A5.5 5.5 0 0 1 8 9.6c0-1 .6-1.8 1.6-2l.8 1.8z" /></svg>,
  instagram: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>,
  facebook: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z" /></svg>,
  youtube: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="m10 9 5 3-5 3z" fill="currentColor" /></svg>,
};

// Only a real web address for that site counts (e.g. "identee.co.in" in the
// Instagram box is not an Instagram link).
const socialUrl = (v, host) => {
  const s = String(v || "").trim();
  if (!s) return null;
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").endsWith(host) ? u.href : null;
  } catch {
    return null;
  }
};

export default function SiteFooter() {
  const dispatch = useDispatch();
  const { values: s = {}, isLoaded } = useSelector((st) => st.publicSettings);
  const { items: categories, status } = useSelector((st) => st.categories);

  useEffect(() => {
    if (!isLoaded) dispatch(fetchPublicSettings());
    if (status === "idle") dispatch(fetchCategories());
  }, [dispatch, isLoaded, status]);

  const storeName = s["general.storeName"] || "IDENTEE";
  const email = s["general.storeEmail"] || s["general.supportEmail"];
  const phone = s["general.phoneNumber"];
  const whatsapp = s["general.whatsappNumber"];
  const address = s["general.businessAddress"];
  const digits = (n) => String(n || "").replace(/\D/g, "");
  const wa = digits(whatsapp);
  const social = [
    ["Instagram", socialUrl(s["general.instagramUrl"], "instagram.com"), Icon.instagram],
    ["Facebook", socialUrl(s["general.facebookUrl"], "facebook.com"), Icon.facebook],
    ["YouTube", socialUrl(s["general.youtubeUrl"], "youtube.com"), Icon.youtube],
  ].filter(([, url]) => url);
  const shopCats = (categories || []).filter((c) => !c.comingSoon && c.productCount > 0).slice(0, 6);

  return (
    <footer className="sf">
      <style>{CSS}</style>

      {(email || phone || whatsapp) && (
        <div className="sf-contact">
          <div className="sf-wrap">
            <h2>Talk to us</h2>
            <p>Questions about sizes, prints or an order? We're happy to help.</p>
            <div className="sf-ways">
              {email && (
                <a href={`mailto:${email}`}>
                  {Icon.mail} {email}
                </a>
              )}
              {phone && (
                <a href={`tel:+${digits(phone).length === 10 ? `91${digits(phone)}` : digits(phone)}`}>
                  {Icon.phone} {phone}
                </a>
              )}
              {wa && (
                <a href={`https://wa.me/${wa.length === 10 ? `91${wa}` : wa}`} target="_blank" rel="noreferrer">
                  {Icon.whatsapp} WhatsApp {whatsapp}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="sf-wrap">
        <div className="sf-grid">
          <nav className="sf-col" aria-label="Shop">
            <h3>Shop</h3>
            <ul>
              <li><Link to="/customizable">Design your own</Link></li>
              <li><Link to="/ready-made">Ready-made</Link></li>
              {shopCats.map((c) => (
                <li key={c._id || c.slug}><Link to={`/category/${c.slug}`}>{c.name}</Link></li>
              ))}
            </ul>
          </nav>
          <nav className="sf-col" aria-label="Your account">
            <h3>Your account</h3>
            <ul>
              <li><Link to="/orders">My orders</Link></li>
              <li><Link to="/my-designs">My designs</Link></li>
              <li><Link to="/cart">Cart</Link></li>
              <li><Link to="/favorites">Favourites</Link></li>
              <li><Link to="/account">Account</Link></li>
            </ul>
          </nav>
          <nav className="sf-col" aria-label={storeName}>
            <h3>{storeName}</h3>
            <ul>
              <li><Link to="/about-us">About us</Link></li>
              <li><Link to="/contact-us">Contact us</Link></li>
              <li><Link to="/contact-us">Bulk &amp; team orders</Link></li>
            </ul>
            {social.length > 0 && (
              <div className="sf-social">
                {social.map(([name, url, icon]) => (
                  <a key={name} href={url} target="_blank" rel="noreferrer" aria-label={name} title={name}>
                    {icon}
                  </a>
                ))}
              </div>
            )}
          </nav>
          {address && (
            <div className="sf-col">
              <h3>Visit us</h3>
              <address>{address}</address>
              <div className="sf-map">
                <iframe title="Store location on the map" src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`} loading="lazy" />
              </div>
            </div>
          )}
        </div>
        <div className="sf-bottom">
          <span>© {new Date().getFullYear()} {storeName}. All rights reserved.</span>
          {s["general.storeDescription"] && <span>{s["general.storeDescription"]}</span>}
        </div>
      </div>
    </footer>
  );
}

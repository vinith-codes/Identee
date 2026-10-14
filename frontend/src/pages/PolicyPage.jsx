// pages/PolicyPage.jsx
//
// The shop's policy pages: Terms & Conditions, Privacy, Refunds & Cancellations,
// Shipping & Delivery (/terms, /privacy-policy, /refund-policy, /shipping-policy).
// Razorpay checks these before it activates live payments.
//
// The business details (name, email, phone, address) come from Admin → Settings →
// General, so the pages stay right when they change. The rules themselves (days,
// timings) are IDENTEE's first draft — the client confirms them (docs/HANDOFF.md).
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchPublicSettings } from "../redux/slices/publicSettingsSlice";
import { POLICY_LINKS } from "../utils/policyLinks";

const UPDATED = "14 October 2026";

// The rules in one place, so a change is made once.
const RULES = {
  makeDays: "2–4 working days", // printing a custom order
  teamMakeDays: "5–7 working days", // team and bulk orders
  deliveryDays: "3–7 working days", // after dispatch
  reportDays: "3 days", // to report a misprint, damage or wrong item
  exchangeDays: "7 days", // ready-made size exchange
  refundDays: "5–7 working days",
};

const CSS = `
  .pp { --ink: #15130F; --text: #2B2722; --muted: #6F6A60; --line: #E6E0D3; --soft: #FBF7EE; --gold: #B8912F;
        background: #fff; color: var(--text); font-family: "Inter", "Helvetica Neue", Arial, sans-serif; }
  .pp-hero { background: var(--soft); border-bottom: 1px solid var(--line); padding-block: 56px 40px; }
  .pp-wrap { max-width: 1120px; margin: 0 auto; padding-inline: 24px; }
  .pp-kicker { margin: 0; font: 700 11.5px/1 "Inter", sans-serif; letter-spacing: .2em; text-transform: uppercase; color: var(--gold); }
  .pp h1 { margin: 12px 0 0; font: 700 clamp(30px, 4.4vw, 46px)/1.08 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; letter-spacing: -0.02em; color: var(--ink); text-wrap: balance; }
  .pp-lead { margin: 14px 0 0; max-width: 64ch; font-size: 16.5px; line-height: 1.6; color: var(--muted); }
  .pp-updated { margin: 18px 0 0; font-size: 13px; color: var(--muted); }
  .pp-body { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 56px; padding-block: 48px 80px; }
  .pp-nav { position: sticky; top: 96px; align-self: start; display: grid; gap: 4px; }
  .pp-nav h2 { margin: 0 0 10px; font: 700 11px/1 "Inter", sans-serif; letter-spacing: .2em; text-transform: uppercase; color: var(--muted); }
  .pp-nav a { display: block; padding: 9px 12px; border-radius: 10px; font-size: 14.5px; color: var(--text); text-decoration: none; }
  .pp-nav a:hover { background: var(--soft); }
  .pp-nav a.on { background: var(--ink); color: #fff; font-weight: 600; }
  .pp-main { min-width: 0; max-width: 72ch; }
  .pp-main section + section { margin-top: 38px; }
  .pp-main h2 { margin: 0 0 12px; font: 700 21px/1.25 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; color: var(--ink); }
  .pp-main p, .pp-main li { font-size: 15.5px; line-height: 1.7; }
  .pp-main p { margin: 0 0 12px; }
  .pp-main ul { margin: 0 0 12px; padding-left: 20px; display: grid; gap: 6px; }
  .pp-main strong { color: var(--ink); }
  .pp-main a { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
  .pp-note { margin-top: 12px; padding: 14px 16px; border-radius: 12px; background: var(--soft); border: 1px solid var(--line); font-size: 15px; }
  .pp-contact { margin-top: 44px; padding: 22px 24px; border-radius: 16px; border: 1px solid var(--line); }
  .pp-contact h2 { margin-bottom: 8px; }
  .pp-contact dl { margin: 12px 0 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 18px; font-size: 15px; }
  .pp-contact dt { color: var(--muted); }
  .pp-contact dd { margin: 0; white-space: pre-line; overflow-wrap: anywhere; }
  .pp a:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; border-radius: 6px; }
  @media (max-width: 860px) {
    .pp-body { grid-template-columns: minmax(0, 1fr); gap: 28px; padding-block: 28px 60px; }
    .pp-nav { position: static; display: flex; flex-wrap: wrap; gap: 8px; }
    .pp-nav h2 { width: 100%; }
    .pp-nav a { border: 1px solid var(--line); }
  }
`;

/* ------------------------------------------------------------------ */
/*  The pages. b = the business details from Admin → Settings          */
/* ------------------------------------------------------------------ */
const contactLine = (b) => (b.email ? <a href={`mailto:${b.email}`}>{b.email}</a> : <Link to="/contact-us">our Contact page</Link>);

const PAGES = {
  "/terms": {
    title: "Terms & Conditions",
    lead: (b) => `These terms apply when you use the ${b.name} website and when you buy from us. By placing an order you agree to them.`,
    sections: (b) => [
      ["Who we are", <>
        <p>This website is run by <strong>{b.name}</strong>{b.address ? <>, {b.address.replace(/\s*,?\s*\n\s*/g, ", ")}</> : null}. When these terms say “we” or “us”, they mean {b.name}; “you” means the person using the site or placing the order.</p>
      </>],
      ["Your account", <>
        <p>You sign in with a one-time code sent to your email. Keep your email account safe — anyone who can read it can sign in as you. Please give us correct details (name, phone, delivery address), as we use them to make and deliver your order.</p>
      </>],
      ["Custom designs", <>
        <p>With our design tools you can put your own text, pictures and logos on a garment. When you upload or use any artwork, you confirm that:</p>
        <ul>
          <li>you own it, or you have permission to print it (for example, a team or company logo you are allowed to use);</li>
          <li>it does not copy someone else’s brand, artwork or photo without permission;</li>
          <li>it is not offensive, hateful, obscene or unlawful.</li>
        </ul>
        <p>We may refuse or cancel an order whose design breaks these rules, and refund what you paid. You are responsible for any claim that your artwork infringes someone else’s rights.</p>
        <p>What you see on screen is a preview. Printed colours can differ slightly from your screen, and print sizes follow the size of the garment you choose.</p>
      </>],
      ["Designs made with AI", <>
        <p>Our design assistant can make pictures for you using an AI service (Google). These pictures are made for you to print on your order. Because they are made by a computer, they may now and then look like existing artwork or contain small mistakes — please check the picture, including any spelling, before you order. We may decline to print an AI picture that breaks the rules above.</p>
      </>],
      ["Prices and payment", <>
        <p>All prices are in Indian Rupees (₹). Any GST is shown at checkout before you pay. Delivery charges depend on your state and are shown at checkout.</p>
        <p>You can pay online through <strong>Razorpay</strong> (cards, UPI, net banking, wallets) or, where offered, by <strong>cash on delivery</strong>. We do not see or store your card or bank details — Razorpay handles them.</p>
        <p>If a price on the site is clearly wrong because of a mistake, we will tell you before printing and you can cancel for a full refund.</p>
      </>],
      ["Orders", <>
        <p>Your order is confirmed when you receive our confirmation email. Custom items are made only for you, so please check your design, size and quantity carefully before paying. Cancellations, returns and refunds follow our <Link to="/refund-policy">Refunds & Cancellations</Link> policy; delivery follows our <Link to="/shipping-policy">Shipping & Delivery</Link> policy.</p>
      </>],
      ["Our designs and website", <>
        <p>The website, our logo, our ready-made designs and our art library belong to {b.name} or to the people who licensed them to us. You may use art-library designs on the products you buy from us, but not copy them for other uses.</p>
      </>],
      ["Liability", <>
        <p>We do our best to make and deliver every order correctly. If something goes wrong, our responsibility is limited to reprinting the item or refunding what you paid for it. We are not responsible for delays caused by events outside our control, such as courier disruptions, strikes or natural events.</p>
      </>],
      ["Changes and law", <>
        <p>We may update these terms; the date at the top shows the latest version, and the version in force when you ordered applies to that order. These terms are governed by the laws of India, and any dispute is subject to the courts of the city of our registered address.</p>
      </>],
    ],
  },

  "/privacy-policy": {
    title: "Privacy Policy",
    lead: (b) => `How ${b.name} collects, uses and protects your personal information.`,
    sections: (b) => [
      ["What we collect", <>
        <ul>
          <li><strong>Account details:</strong> your name, email address and phone number.</li>
          <li><strong>Order details:</strong> delivery address, the items you order, and payment status (not your card or bank details).</li>
          <li><strong>Your designs:</strong> the text, pictures and logos you upload or create, and preview pictures of your design.</li>
          <li><strong>Messages:</strong> what you send us through the contact form, email or WhatsApp.</li>
          <li><strong>On your device:</strong> the site saves your sign-in and your unfinished design in your browser’s storage, so they are still there when you come back.</li>
        </ul>
      </>],
      ["How we use it", <>
        <ul>
          <li>to make, print and deliver your order, and to send you order updates;</li>
          <li>to send your sign-in codes by email;</li>
          <li>to answer your questions and handle returns or refunds;</li>
          <li>to keep the site safe and stop misuse;</li>
          <li>to meet tax and legal requirements (for example, keeping invoices).</li>
        </ul>
        <p>We do not sell your personal information, and we do not send marketing messages — we only email you about your account and your orders.</p>
      </>],
      ["Who we share it with", <>
        <p>Only what each one needs to do its job:</p>
        <ul>
          <li><strong>Razorpay</strong> — to take online payments;</li>
          <li><strong>courier partners</strong> — your name, phone and address, to deliver your order;</li>
          <li><strong>Cloudinary</strong> — stores the pictures you upload and your design previews;</li>
          <li><strong>Google</strong> — when you use the AI design assistant, your request (and any photo you give it) is sent to Google’s AI service to make the picture;</li>
          <li><strong>our email provider</strong> — to send sign-in codes and order emails;</li>
          <li>government authorities, when the law requires it.</li>
        </ul>
      </>],
      ["How long we keep it", <>
        <p>We keep your account and order details while your account is open, and invoices for as long as tax law requires. Your saved designs stay in your account until you delete them or ask us to.</p>
      </>],
      ["Your choices", <>
        <p>You can see and change your details in your account. To get a copy of your information, correct it, or have your account and designs deleted, write to {contactLine(b)}. We will reply within 30 days. Invoices we must keep by law are kept even after an account is deleted.</p>
      </>],
      ["Security", <>
        <p>We use secure (HTTPS) connections, sign-in by one-time code, and limited staff access to protect your information. No system is perfectly secure, but we work to keep your data safe and will tell you if a problem affects you.</p>
      </>],
      ["Children", <>
        <p>Our site is meant for adults. If you are under 18, please order with a parent’s or guardian’s help.</p>
      </>],
      ["Questions and complaints", <>
        <p>For any question or complaint about your personal information, contact us at {contactLine(b)}. We may update this policy; the date at the top shows the latest version.</p>
      </>],
    ],
  },

  "/refund-policy": {
    title: "Refunds & Cancellations",
    lead: () => "Custom prints are made just for you, so they work a little differently from ready-made products. Here is what you can expect.",
    sections: (b) => [
      ["Cancelling an order", <>
        <ul>
          <li><strong>Custom (design-your-own) orders</strong> can be cancelled for a full refund until we start printing — usually within 24 hours of placing the order. Once printing has started, the order can’t be cancelled.</li>
          <li><strong>Ready-made products</strong> can be cancelled any time before they are dispatched.</li>
        </ul>
        <p>To cancel, contact us at {contactLine(b)}{b.phone ? <> or call {b.phone}</> : null} with your order number as soon as possible.</p>
      </>],
      ["If something is wrong with your order", <>
        <p>We check every print, but if you receive an item that is <strong>misprinted, damaged, a different size from what you ordered, or the wrong item</strong>, we will reprint it or refund it at no cost to you. Please:</p>
        <ul>
          <li>tell us within <strong>{RULES.reportDays} of delivery</strong>, with your order number;</li>
          <li>send clear photos of the problem (and of the package, if it arrived damaged);</li>
          <li>keep the item unused and unwashed until we reply.</li>
        </ul>
        <p>If we need the item back, we will arrange the pickup or pay the return postage.</p>
      </>],
      ["Custom items: what we can’t accept back", <>
        <p>Because a custom item is printed only for you, we can’t take it back or refund it when:</p>
        <ul>
          <li>you changed your mind, or ordered the wrong size — please check the size chart before ordering;</li>
          <li>a spelling mistake, picture or placement was in the design you approved;</li>
          <li>a picture you uploaded was low quality and prints soft (the design tool warns you when a picture may print blurry);</li>
          <li>colours differ slightly from your screen.</li>
        </ul>
      </>],
      ["Ready-made products", <>
        <p>Ready-made products can be <strong>exchanged for another size</strong> within <strong>{RULES.exchangeDays} of delivery</strong> if they are unused, unwashed and have their tags. Contact us first to arrange it. Ready-made products are exchanged, not refunded, and when the exchange isn’t because of our mistake, the courier cost is paid by the customer.</p>
      </>],
      ["How refunds are paid", <>
        <ul>
          <li><strong>Online payments</strong> are refunded to the same card, UPI or account you paid with, within <strong>{RULES.refundDays}</strong> after we approve the refund (your bank may take a little longer to show it).</li>
          <li><strong>Cash on delivery</strong> orders are refunded by bank transfer or UPI to details you give us.</li>
          <li>Delivery charges are refunded when the mistake was ours.</li>
        </ul>
      </>],
    ],
  },

  "/shipping-policy": {
    title: "Shipping & Delivery",
    lead: () => "Where we deliver, how long it takes, and what it costs.",
    sections: (b) => [
      ["Where we deliver", <>
        <p>We deliver across <strong>India</strong>. If we can’t deliver to your state, the checkout will tell you before you pay. We do not ship outside India at the moment.</p>
      </>],
      ["How long it takes", <>
        <ul>
          <li><strong>Printing custom orders:</strong> {RULES.makeDays} after your order is confirmed.</li>
          <li><strong>Team and bulk orders:</strong> usually {RULES.teamMakeDays}, depending on the quantity. We will tell you if it will take longer.</li>
          <li><strong>Ready-made products</strong> are usually dispatched within 1–2 working days.</li>
          <li><strong>Delivery:</strong> {RULES.deliveryDays} after dispatch, depending on your location.</li>
        </ul>
        <p className="pp-note">Working days are Monday to Saturday, excluding public holidays. These times are estimates; we will keep you updated if there is a delay.</p>
      </>],
      ["Delivery charges", <>
        <p>Delivery charges depend on your state and are shown at checkout before you pay. Orders above a certain amount may ship free — the checkout shows it when your order qualifies.</p>
      </>],
      ["Tracking your order", <>
        <p>You can follow your order’s status under <Link to="/orders">My orders</Link>. When it is dispatched, we share the courier details so you can track the parcel.</p>
      </>],
      ["If delivery doesn’t go to plan", <>
        <ul>
          <li>Please make sure your address, pin code and phone number are correct — we can’t change the address once an order has been dispatched.</li>
          <li>If the courier can’t deliver after its attempts, the parcel comes back to us. We can send it again; the extra delivery charge may apply.</li>
          <li>If your parcel arrives open or damaged, take photos and contact us within {RULES.reportDays} — see our <Link to="/refund-policy">Refunds & Cancellations</Link> policy.</li>
        </ul>
        <p>Questions about a delivery? Contact us at {contactLine(b)}{b.phone ? <> or call {b.phone}</> : null}.</p>
      </>],
    ],
  },
};

export default function PolicyPage() {
  const { pathname } = useLocation();
  const dispatch = useDispatch();
  const { values: s = {}, isLoaded } = useSelector((st) => st.publicSettings);
  useEffect(() => {
    if (!isLoaded) dispatch(fetchPublicSettings());
  }, [dispatch, isLoaded]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const page = PAGES[pathname] || PAGES["/terms"];
  const b = {
    name: s["general.storeName"] || "IDENTEE",
    email: s["general.storeEmail"] || s["general.supportEmail"] || "",
    phone: s["general.phoneNumber"] || "",
    address: s["general.businessAddress"] || "",
  };
  useEffect(() => {
    document.title = `${page.title} · ${b.name}`;
  }, [page.title, b.name]);

  return (
    <div className="pp">
      <style>{CSS}</style>
      <header className="pp-hero">
        <div className="pp-wrap">
          <p className="pp-kicker">Policies</p>
          <h1>{page.title}</h1>
          <p className="pp-lead">{page.lead(b)}</p>
          <p className="pp-updated">Last updated: {UPDATED}</p>
        </div>
      </header>
      <div className="pp-wrap pp-body">
        <nav className="pp-nav" aria-label="Policies">
          <h2>Policies</h2>
          {POLICY_LINKS.map(([to, label]) => (
            <Link key={to} to={to} className={to === pathname ? "on" : undefined} aria-current={to === pathname ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <main className="pp-main">
          {page.sections(b).map(([title, body]) => (
            <section key={title}>
              <h2>{title}</h2>
              {body}
            </section>
          ))}
          <div className="pp-contact">
            <h2>Contact us</h2>
            <p>Questions about this policy or an order? We’re happy to help.</p>
            <dl>
              <dt>Business</dt>
              <dd>{b.name}</dd>
              {b.email && (
                <>
                  <dt>Email</dt>
                  <dd><a href={`mailto:${b.email}`}>{b.email}</a></dd>
                </>
              )}
              {b.phone && (
                <>
                  <dt>Phone</dt>
                  <dd>{b.phone}</dd>
                </>
              )}
              {b.address && (
                <>
                  <dt>Address</dt>
                  <dd>{b.address}</dd>
                </>
              )}
              <dt>Write to us</dt>
              <dd><Link to="/contact-us">Contact form</Link></dd>
            </dl>
          </div>
        </main>
      </div>
    </div>
  );
}

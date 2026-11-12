// studio/AssistantCards.jsx — the cards the Assistant shows in the chat since round 8 (11 Nov 2026):
//   SizeCard     "what size am I?": height and weight in, a size out (the same rule as the size finder)
//   OrdersCard   the customer's last orders: status, cancel, order the same tee again
//   ReorderCard  "the same tee again in blue": asks first, then opens a copy of the ordered design
//   GroupCard    one link for a team or a class: friends vote and fill in their own name, size and number
//   SpotPicker   "Change a part": point at the part of a picture that should change (a tap marks it, nothing is drawn)
// Every card only talks to the page through ctx() (studio/DesignRoomPage.jsx → assistantCtx).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { imageUrl } from "../utils/imageUrl";
import orderService from "../services/orderService";
import groupService from "../services/groupService";
import { groupLink, ORDER_WORDS, orderNo, ownDesignId, findOrder, sizeAnswers, spotWords, spotName, voteFromSheet, voteLeader, SIZE_LIMITS } from "./assistantExtras";

const token = () => {
  try {
    return JSON.parse(localStorage.getItem("userInfo") || "{}").token || "";
  } catch {
    return "";
  }
};
const why = (err, fallback) => err?.response?.data?.message || fallback;
const dayOf = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/* ---------- size from height and weight ---------- */
const WHO_CHIPS = [
  ["men", "Men"],
  ["women", "Women"],
  ["kids", "Kids"],
];
export function SizeCard({ ask = {}, ctx, onUse }) {
  const [who, setWho] = useState(ask.who || "men");
  const [height, setHeight] = useState(ask.heightCm ? String(ask.heightCm) : "");
  const [weight, setWeight] = useState(ask.weightKg ? String(ask.weightKg) : "");
  const answers = sizeAnswers({ who, heightCm: height, weightKg: weight });
  const c = ctx();
  const fit = answers ? c.sizeFor?.(answers) : null;
  const odd = !answers && height && weight; // both typed, but not believable numbers
  return (
    <div className="dr-card dr-sizecard">
      <b className="dr-card-title">Your size for this tee</b>
      <div className="dr-card-row" role="group" aria-label="Who is the tee for?">
        {WHO_CHIPS.map(([key, label]) => (
          <button key={key} type="button" className={`dr-chip${who === key ? " on" : ""}`} aria-pressed={who === key} onClick={() => setWho(key)}>{label}</button>
        ))}
      </div>
      <div className="dr-card-two">
        <label>
          <span>Height (cm)</span>
          <input type="number" inputMode="numeric" min={SIZE_LIMITS.height[0]} max={SIZE_LIMITS.height[1]} value={height} placeholder="170" onChange={(e) => setHeight(e.target.value.slice(0, 5))} />
        </label>
        <label>
          <span>Weight (kg)</span>
          <input type="number" inputMode="numeric" min={SIZE_LIMITS.weight[0]} max={SIZE_LIMITS.weight[1]} value={weight} placeholder="65" onChange={(e) => setWeight(e.target.value.slice(0, 5))} />
        </label>
      </div>
      {odd && <small className="dr-card-note">Please check the numbers: height in centimetres (5 ft 7 in is about 170) and weight in kilograms.</small>}
      {fit && (
        <div className="dr-sizeresult" aria-live="polite">
          <p>
            <span>Best size</span>
            <b>{fit.size}</b>
          </p>
          <small>{fit.word}</small>
          {fit.chest ? <small>The tee: chest {fit.chest} in{fit.length ? `, length ${fit.length} in` : ""}.</small> : null}
          {fit.note ? <small>{fit.note}</small> : null}
          {c.sizeNow === fit.size ? (
            <span className="dr-card-ok">Size {fit.size} is chosen ✓</span>
          ) : (
            <button type="button" className="dr-mini" onClick={() => onUse(fit.size)}>Use size {fit.size}</button>
          )}
        </div>
      )}
      {answers && !fit && <small className="dr-card-note">This tee has no size chart for {who === "kids" ? "kids" : who}. Try another choice above.</small>}
      {!answers && !odd && <small className="dr-card-note">Type both and the size shows here. It is an estimate from your numbers, like the size finder.</small>}
    </div>
  );
}

/* ---------- orders ---------- */
function useOrders() {
  const [orders, setOrders] = useState(null); // null = loading
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    orderService
      .getMyOrders(token())
      .then((list) => alive && setOrders([...(Array.isArray(list) ? list : list?.orders || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))))
      .catch((err) => alive && setError(why(err, "Your orders couldn’t be loaded just now. Please try again.")));
    return () => {
      alive = false;
    };
  }, []);
  return { orders, setOrders, error };
}
const itemsLine = (o) => (o.orderItems || []).slice(0, 3).map((i) => `${i.qty} × ${String(i.name || "Tee").slice(0, 34)}${i.size ? ` (${i.size})` : ""}`).join(", ") + ((o.orderItems || []).length > 3 ? " …" : "");

export function OrdersCard({ ctx, live }) {
  const { orders, setOrders, error } = useOrders();
  const [asking, setAsking] = useState(null); // { id, kind: "cancel" | "again" }
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState({}); // { [order id]: what happened }
  const note = (id, text) => setNotes((n) => ({ ...n, [id]: text }));
  const cancel = async (o) => {
    setBusy(true);
    try {
      const res = await orderService.cancelMyOrder(o._id, token());
      setOrders((list) => list.map((x) => (x._id === o._id ? { ...x, ...(res.order || { orderStatus: res.status || x.orderStatus, cancelMode: null }), orderItems: x.orderItems } : x)));
      note(o._id, res.message || "Done.");
    } catch (err) {
      note(o._id, why(err, "Couldn’t cancel the order. Please try again or contact us."));
    } finally {
      setBusy(false);
      setAsking(null);
    }
  };
  const again = async (o) => {
    setBusy(true);
    const res = await ctx().again?.(ownDesignId(o), null, orderNo(o));
    setBusy(false);
    setAsking(null);
    if (res && !res.ok) note(o._id, res.message);
  };
  if (error) return <div className="dr-card"><small className="dr-card-note">{error}</small></div>;
  if (!orders) return <div className="dr-card"><small className="dr-card-note">Looking up your orders…</small></div>;
  if (!orders.length) return <div className="dr-card"><small className="dr-card-note">You haven’t ordered anything yet. When you do, your orders show here.</small></div>;
  return (
    <div className="dr-card dr-orders">
      <b className="dr-card-title">Your orders</b>
      {orders.slice(0, 3).map((o) => {
        const ask = asking?.id === o._id ? asking.kind : null;
        const cancelWord = o.cancelMode === "ask" ? "Ask to cancel" : "Cancel order";
        return (
          <div key={o._id} className="dr-order">
            <p>
              <b>{orderNo(o)}</b>
              <span className={`dr-order-status s-${String(o.orderStatus || "").toLowerCase()}`}>{ORDER_WORDS[o.orderStatus] || o.orderStatus}</span>
            </p>
            <small>{dayOf(o.createdAt)} · ₹{o.totalPrice} · {itemsLine(o)}</small>
            {o.cancelMode === "asked" && <small>You asked to cancel this order. We’ll email you our answer soon.</small>}
            {notes[o._id] && <small className="dr-card-ok">{notes[o._id]}</small>}
            {ask === "cancel" && (
              <div className="dr-card-ask" role="group" aria-label={cancelWord}>
                <span>{o.cancelMode === "ask" ? "Your tee may already be printing. Ask the shop to cancel it? We’ll email you our answer." : `Cancel this order?${o.isPaid ? ` ₹${o.totalPrice} will be refunded.` : ""}`}</span>
                <button type="button" className="dr-dact out" disabled={busy} onClick={() => cancel(o)}>{busy ? "Sending…" : o.cancelMode === "ask" ? "Yes, ask to cancel" : "Yes, cancel"}</button>
                <button type="button" className="dr-dact" disabled={busy} onClick={() => setAsking(null)}>Keep my order</button>
              </div>
            )}
            {ask === "again" && (
              <div className="dr-card-ask" role="group" aria-label="Order this tee again">
                <span>Open this tee again as a new design? The tee you are working on is saved first.</span>
                <button type="button" className="dr-mini" disabled={busy} onClick={() => again(o)}>{busy ? "Opening…" : "Yes, open it"}</button>
                <button type="button" className="dr-dact" disabled={busy} onClick={() => setAsking(null)}>Not now</button>
              </div>
            )}
            {!ask && (
              <div className="dr-card-row">
                <a className="dr-dact" href="/orders" target="_blank" rel="noopener">Track</a>
                {ownDesignId(o) && <button type="button" className="dr-dact" disabled={!live} onClick={() => setAsking({ id: o._id, kind: "again" })}>Order again</button>}
                {["now", "ask"].includes(o.cancelMode) && <button type="button" className="dr-dact out" onClick={() => setAsking({ id: o._id, kind: "cancel" })}>{cancelWord}</button>}
              </div>
            )}
          </div>
        );
      })}
      {orders.length > 3 && <a className="dr-card-link" href="/orders" target="_blank" rel="noopener">See all {orders.length} orders</a>}
    </div>
  );
}

// "the same tee again (in blue)": the order is looked up, shown, and opened only after a Yes
export function ReorderCard({ ask = {}, done, ctx, live, onDone }) {
  const { orders, error } = useOrders();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (done) return <div className="dr-card done"><small className="dr-card-note">{done}</small></div>;
  if (error) return <div className="dr-card"><small className="dr-card-note">{error}</small></div>;
  if (!orders) return <div className="dr-card"><small className="dr-card-note">Looking up your orders…</small></div>;
  const order = findOrder(orders, ask.order);
  if (!order) {
    return (
      <div className="dr-card">
        <small className="dr-card-note">{ask.order ? `I couldn’t find order ${ask.order} with a design of your own.` : "I couldn’t find an order with a design of your own."} Tees from the shop can be bought again from Shop your IDENTEE.</small>
      </div>
    );
  }
  const open = async () => {
    setBusy(true);
    const res = await ctx().again?.(ownDesignId(order), ask.colour || null, orderNo(order));
    setBusy(false);
    if (res && !res.ok) setNote(res.message);
  };
  return (
    <div className="dr-card">
      <b className="dr-card-title">The same tee again{ask.colour ? ` in ${ask.colour}` : ""}</b>
      <small>
        Order {orderNo(order)} · {dayOf(order.createdAt)} · {itemsLine(order)}
      </small>
      <small className="dr-card-note">It opens here as a new design. The tee you are working on is saved first. Then pick the sizes and go to Review.</small>
      {note && <small className="dr-card-warn">{note}</small>}
      <div className="dr-card-row">
        <button type="button" className="dr-mini" disabled={busy || !live} onClick={open}>{busy ? "Opening…" : "Yes, open it"}</button>
        <button type="button" className="dr-dact" disabled={busy} onClick={() => onDone("Okay, not now.")}>Not now</button>
      </div>
    </div>
  );
}

/* ---------- the group link ---------- */
export function GroupCard({ group = {}, sheet, ctx, live, onPatch, onSay, onMessages }) {
  const c = ctx();
  const vote = voteFromSheet(sheet);
  const [title, setTitle] = useState(group.title || "");
  const [askNumber, setAskNumber] = useState(false);
  const [withVote, setWithVote] = useState(true);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [data, setData] = useState(null); // the answers so far (the owner's view)
  const [showNames, setShowNames] = useState(false);
  const link = group.token ? groupLink(window.location.origin, group.token) : "";

  const load = async () => {
    if (!group.token) return;
    setBusy("load");
    try {
      setData(await groupService.entries(group.token));
      setNote("");
    } catch (err) {
      setNote(why(err, "The answers couldn’t be loaded just now."));
    } finally {
      setBusy("");
    }
  };
  // the answers so far, as soon as there is a link (and again when the chat is opened later)
  useEffect(() => {
    if (!group.token) return undefined;
    let alive = true;
    groupService
      .entries(group.token)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setNote(why(err, "The answers couldn’t be loaded just now.")));
    return () => {
      alive = false;
    };
  }, [group.token]);

  const make = async () => {
    setBusy("make");
    setNote("");
    try {
      const made = await groupService.create({
        title: title.trim() || `${c.garmentLabel || "Tees"} for our group`,
        garment: c.garmentLabel || "",
        ...(withVote && vote.picture ? vote : {}),
        sizes: c.sizes,
        askNumber,
      });
      onPatch({ group: { token: made.token, title: made.title, askNumber: made.askNumber, voting: made.options.length > 0 } });
    } catch (err) {
      setNote(why(err, "The link couldn’t be made just now. Please try again."));
    } finally {
      setBusy("");
    }
  };
  const share = async () => {
    const text = `${group.title || "Our tees"}: ${group.voting ? "pick the design you like and " : ""}fill in your name and size`;
    try {
      if (navigator.share) {
        await navigator.share({ title: group.title || "Our tees", text, url: link });
        return;
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link and send it to your friends:", link);
    }
  };
  const close = async (closed) => {
    setBusy("close");
    try {
      const next = await groupService.close(group.token, closed);
      setData((d) => (d ? { ...d, closed: next.closed } : d));
    } catch (err) {
      setNote(why(err, "That didn’t work just now. Please try again."));
    } finally {
      setBusy("");
    }
  };
  // the page turns the answers into tees and says what it did
  const fill = (kind) => {
    const msgs = kind === "names" ? c.groupTeam?.(data.entries) : c.groupSizes?.(data.entries);
    if (msgs?.length) onMessages(msgs);
  };

  if (!group.token) {
    return (
      <div className="dr-card dr-group">
        <b className="dr-card-title">One link for your group</b>
        <small className="dr-card-note">Send one link. Each friend fills in their own name and size{vote.picture ? " and picks the design they like" : ""}. No account needed. Then I fill your tees from their answers.</small>
        <label className="dr-card-field">
          <span>What is it for?</span>
          <input type="text" value={title} maxLength={80} placeholder="CSE-B farewell tees" onChange={(e) => setTitle(e.target.value)} />
        </label>
        {vote.picture ? (
          <label className="dr-card-tick">
            <input type="checkbox" checked={withVote} onChange={(e) => setWithVote(e.target.checked)} />
            <span>Let them vote on concepts {vote.options.map((o) => o.n).join(", ")}</span>
          </label>
        ) : (
          <small className="dr-card-note">Want them to vote on designs too? Ask me for concepts first, then make the link.</small>
        )}
        <label className="dr-card-tick">
          <input type="checkbox" checked={askNumber} onChange={(e) => setAskNumber(e.target.checked)} />
          <span>Ask for a jersey number too</span>
        </label>
        {note && <small className="dr-card-warn">{note}</small>}
        <div className="dr-card-row">
          <button type="button" className="dr-mini" disabled={busy === "make" || !live} onClick={make}>{busy === "make" ? "Making the link…" : "Make the link"}</button>
        </div>
      </div>
    );
  }
  const leader = voteLeader(data?.options);
  const count = data?.count || 0;
  const most = Math.max(1, ...(data?.options || []).map((o) => o.votes));
  return (
    <div className="dr-card dr-group">
      <b className="dr-card-title">{group.title || "Your group link"}</b>
      <input className="dr-group-link" type="text" readOnly value={link} aria-label="The link for your friends" onFocus={(e) => e.target.select()} />
      <div className="dr-card-row">
        <button type="button" className="dr-mini" onClick={share}>{copied ? "Link copied ✓" : "Send to friends"}</button>
        <button type="button" className="dr-dact" disabled={busy === "load"} onClick={load}>{busy === "load" ? "Checking…" : "↻ Check answers"}</button>
      </div>
      {data && (
        <>
          <p className="dr-group-count">
            {count === 0 ? "Nobody has answered yet." : `${count} friend${count === 1 ? " has" : "s have"} answered.`}
            {data.closed ? " The link is closed." : ""}
          </p>
          {data.options?.length > 0 && count > 0 && (
            <ul className="dr-group-votes">
              {data.options.map((o) => (
                <li key={o.n}>
                  <span>
                    {o.n} · {o.title}
                  </span>
                  <i aria-hidden="true">
                    <em style={{ width: `${(100 * o.votes) / most}%` }} />
                  </i>
                  <b>{o.votes}</b>
                </li>
              ))}
            </ul>
          )}
          {count > 0 && (
            <>
              <button type="button" className="dr-card-link" onClick={() => setShowNames((v) => !v)} aria-expanded={showNames}>{showNames ? "Hide the answers" : "See who answered"}</button>
              {showNames && (
                <ol className="dr-group-names">
                  {data.entries.map((e, i) => (
                    <li key={`${e.name}-${i}`}>
                      {e.name} · {e.size || "no size"}
                      {e.number ? ` · no. ${e.number}` : ""}
                      {e.vote ? ` · likes ${e.vote}` : ""}
                    </li>
                  ))}
                </ol>
              )}
              <div className="dr-card-row">
                {leader && <button type="button" className="dr-mini" disabled={!live} onClick={() => onSay(String(leader.n))}>Make concept {leader.n} (most votes)</button>}
                <button type="button" className={leader ? "dr-dact" : "dr-mini"} disabled={!live} onClick={() => fill("names")}>Fill my tees with their names</button>
                <button type="button" className="dr-dact" disabled={!live} onClick={() => fill("sizes")}>Only set the sizes</button>
              </div>
            </>
          )}
          <button type="button" className="dr-card-link" disabled={busy === "close"} onClick={() => close(!data.closed)}>{data.closed ? "Open the link again" : "Close the link (no more answers)"}</button>
        </>
      )}
      {note && <small className="dr-card-warn">{note}</small>}
    </div>
  );
}

/* ---------- "Change a part": point at the picture ---------- */
// A tap puts a marker on the picture (it never draws); "Change this part" hands the spot back in words.
export function SpotPicker({ url, fabric, onUse, onClose }) {
  const [spot, setSpot] = useState(null); // { x, y } from 0 to 1
  const pic = useRef(null);
  const mark = (e) => {
    const box = pic.current?.getBoundingClientRect();
    if (!box?.width) return;
    setSpot({ x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)) });
  };
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const words = spot ? spotWords(spot.x, spot.y) : "";
  return createPortal(
    <div className="dr-spot" role="dialog" aria-label="Point at the part to change">
      <div className="dr-spot-bar">
        <span>{spot ? `Marked: ${spotName(words)}. Tap again to move it.` : "Tap the part of the picture you want changed."}</span>
        <button type="button" className="dr-sheet-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="dr-spot-stage">
        <button type="button" className="dr-spot-pic" onClick={mark} aria-label="The picture. Tap the part to change.">
          <img ref={pic} src={imageUrl(url, 1200)} alt="" style={{ background: fabric || "#fff" }} draggable={false} />
          {spot && <span className="dr-spot-pin" style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }} aria-hidden="true" />}
        </button>
      </div>
      <div className="dr-spot-acts">
        <button type="button" className="dr-spot-go" disabled={!spot} onClick={() => onUse(words)}>Change this part</button>
        <button type="button" className="dr-spot-no" onClick={onClose}>Cancel</button>
      </div>
    </div>,
    document.body,
  );
}

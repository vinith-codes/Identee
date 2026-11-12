// pages/GroupPage.jsx  —  /g/:token  (round 8, 11 Nov 2026)
//
// The page a friend opens from a group link (made in the design room's Assistant: "make a group link").
// No account needed. The friend picks the design they like (when the owner asked for a vote), types the name for
// their tee, picks their size and, when asked, a number. The owner then fills the tees from these answers.
// The friend's own answer is remembered in this browser (with the key the server gave), so they can change it later.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import groupService from "../services/groupService";
import { imageUrl } from "../utils/imageUrl";
import { SHOPS } from "../utils/shopNames";

const CSS = `
  .gp { min-height: 70vh; background: #FBF7EE; padding: 24px 16px 56px; color: #15130F; }
  .gp-in { max-width: 520px; margin: 0 auto; display: grid; gap: 16px; }
  .gp-eyebrow { margin: 0; font-size: 12px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; color: #9A7B25; }
  .gp h1 { margin: 4px 0 0; font-family: 'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif; font-size: clamp(24px, 6vw, 32px); font-weight: 800; line-height: 1.15; overflow-wrap: anywhere; }
  .gp-sub { margin: 6px 0 0; font-size: 14px; color: #71695B; }
  .gp-card { display: grid; gap: 14px; padding: 16px; border-radius: 18px; background: #fff; border: 1px solid #ECE4D2; }
  .gp-pic { display: block; width: 100%; height: auto; border-radius: 12px; background: #F3F1EC; }
  .gp-q { margin: 0; font-size: 14.5px; font-weight: 800; }
  .gp-q small { font-weight: 500; color: #71695B; font-size: 12.5px; }
  .gp-opts { display: grid; gap: 8px; }
  .gp-opt { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 8px 14px; border-radius: 14px; border: 1.5px solid #ECE4D2; background: #fff;
    color: #15130F; font: inherit; font-size: 14.5px; font-weight: 600; text-align: left; cursor: pointer; }
  .gp-opt i { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: #F4ECD8; font-style: normal; font-weight: 800; font-size: 13.5px; }
  .gp-opt span { min-width: 0; overflow-wrap: anywhere; }
  .gp-opt.on { border-color: #15130F; background: #15130F; color: #fff; }
  .gp-opt.on i { background: #C9A24B; color: #15130F; }
  .gp-field { display: grid; gap: 6px; }
  .gp-field input { width: 100%; box-sizing: border-box; min-height: 48px; padding: 0 14px; border-radius: 12px; border: 1.5px solid #ECE4D2; background: #fff;
    color: #15130F; font: inherit; font-size: 16px; }
  .gp-field input:focus { outline: 2px solid #C9A24B; outline-offset: 1px; }
  .gp-sizes { display: flex; gap: 8px; flex-wrap: wrap; }
  .gp-size { min-width: 52px; min-height: 46px; padding: 0 12px; border-radius: 12px; border: 1.5px solid #ECE4D2; background: #fff; color: #15130F;
    font: inherit; font-size: 14.5px; font-weight: 700; cursor: pointer; }
  .gp-size.on { border-color: #15130F; background: #15130F; color: #fff; }
  .gp-send { min-height: 52px; border: none; border-radius: 999px; background: #15130F; color: #fff; font: inherit; font-size: 15.5px; font-weight: 800; cursor: pointer; }
  .gp-send:disabled { opacity: .5; cursor: default; }
  .gp-err { margin: 0; font-size: 13.5px; font-weight: 600; color: #B42318; }
  .gp-ok { margin: 0; font-size: 17px; font-weight: 800; }
  .gp-mine { margin: 0; padding: 12px 14px; border-radius: 12px; background: #FBF7EE; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
  .gp-link { justify-self: start; padding: 6px 0; border: none; background: none; color: #7A5B12; font: inherit; font-size: 14px; font-weight: 700; text-decoration: underline;
    text-underline-offset: 3px; cursor: pointer; min-height: 36px; }
  .gp-votes { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
  .gp-votes li { display: grid; grid-template-columns: minmax(0, 1fr) 90px 24px; gap: 10px; align-items: center; font-size: 13.5px; }
  .gp-votes li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gp-votes li i { display: block; height: 9px; border-radius: 999px; background: #F1ECE1; overflow: hidden; }
  .gp-votes li em { display: block; height: 100%; border-radius: 999px; background: #C9A24B; }
  .gp-votes li b { text-align: right; font-variant-numeric: tabular-nums; }
  .gp-own { display: grid; gap: 4px; padding: 14px 16px; border-radius: 16px; background: #15130F; color: #fff; text-decoration: none; }
  .gp-own b { font-size: 15px; }
  .gp-own span { font-size: 13px; opacity: .8; }
  .gp-skel { height: 220px; border-radius: 18px; background: linear-gradient(90deg, #F3EFE5, #FAF7F0, #F3EFE5); background-size: 200% 100%; animation: gp-shine 1.2s infinite linear; }
  @keyframes gp-shine { to { background-position: -200% 0; } }
`;

const storeKey = (token) => `identee.group.${token}`;
const readMine = (token) => {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey(token)) || "null");
    return saved?.key ? saved : null;
  } catch {
    return null;
  }
};
const saveMine = (token, mine) => {
  try {
    localStorage.setItem(storeKey(token), JSON.stringify(mine));
  } catch {
    /* a private window: the answer is still saved on the server; it just can't be changed from here later */
  }
};

export default function GroupPage() {
  const { token = "" } = useParams();
  const [group, setGroup] = useState(null); // the link as friends see it; false = no such link
  const [mine, setMine] = useState(() => readMine(token)); // this browser's own answer
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => {
    const m = readMine(token);
    return { name: m?.name || "", size: m?.size || "", number: m?.number || "", vote: m?.vote || null };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    groupService
      .get(token)
      .then((g) => alive && setGroup(g))
      .catch((err) => alive && (err.response?.status === 404 ? setGroup(false) : setError("Couldn’t open this link just now. Please check your internet and try again.")));
    return () => {
      alive = false;
    };
  }, [token]);

  const set = (more) => {
    setForm((f) => ({ ...f, ...more }));
    setError("");
  };

  const send = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Please type your name.");
    if (group.options.length && !form.vote) return setError("Please pick the design you like.");
    if (group.sizes.length && !form.size) return setError("Please pick your size.");
    setBusy(true);
    setError("");
    try {
      const res = await groupService.join(token, { name: form.name.trim(), size: form.size, number: form.number, vote: form.vote, key: mine?.key });
      const { key, entry, ...view } = res;
      const saved = { key, ...entry };
      saveMine(token, saved);
      setMine(saved);
      setGroup(view);
      setEditing(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.response?.data?.message || "That didn’t go through. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const wrap = (inside) => (
    <div className="gp">
      <style>{CSS}</style>
      <div className="gp-in">{inside}</div>
    </div>
  );

  if (group === false) {
    return wrap(
      <div className="gp-card">
        <p className="gp-ok">This link doesn’t work</p>
        <p className="gp-sub" style={{ margin: 0 }}>It may have been typed wrong. Ask the person who sent it to send it again.</p>
        <Link className="gp-link" to="/">Go to IDENTEE</Link>
      </div>,
    );
  }
  if (!group) return wrap(error ? <p className="gp-err">{error}</p> : <div className="gp-skel" aria-label="Opening the link" />);

  const answered = mine && !editing;
  const shut = (group.closed || group.full) && !mine;
  const most = Math.max(1, ...group.options.map((o) => o.votes || 0));
  const myOption = group.options.find((o) => o.n === mine?.vote);
  const step = (n) => (group.options.length ? n : n - 1);

  return wrap(
    <>
      <header>
        <p className="gp-eyebrow">IDENTEE group tee</p>
        <h1>{group.title || "Our group tee"}</h1>
        <p className="gp-sub">
          {[group.garment, group.count ? `${group.count} ${group.count === 1 ? "person has" : "people have"} answered` : group.closed ? "" : "Be the first to answer"].filter(Boolean).join(" · ")}
        </p>
      </header>

      {group.picture && (
        <div className="gp-card" style={{ padding: 10 }}>
          <img className="gp-pic" src={imageUrl(group.picture, 1000)} alt={group.options.length ? `The designs to choose from: ${group.options.map((o) => `${o.n}. ${o.title}`).join(", ")}` : "The design"} />
        </div>
      )}

      {shut ? (
        <div className="gp-card">
          <p className="gp-ok">{group.closed ? "This link is closed" : "This group is full"}</p>
          <p className="gp-sub" style={{ margin: 0 }}>No more answers can be added. Ask the person who sent the link.</p>
        </div>
      ) : answered ? (
        <div className="gp-card" aria-live="polite">
          <p className="gp-ok">Thank you, {mine.name}! Your answer is saved.</p>
          <p className="gp-mine">
            {myOption && (
              <>
                Design: <b>{myOption.n}. {myOption.title}</b>
                <br />
              </>
            )}
            Name on the tee: <b>{mine.name}</b>
            {mine.size && (
              <>
                <br />
                Size: <b>{mine.size}</b>
              </>
            )}
            {mine.number && (
              <>
                <br />
                Number: <b>{mine.number}</b>
              </>
            )}
          </p>
          {group.options.length > 0 && (
            <>
              <p className="gp-q">The votes so far</p>
              <ul className="gp-votes">
                {group.options.map((o) => (
                  <li key={o.n}>
                    <span>{o.n}. {o.title}</span>
                    <i><em style={{ width: `${((o.votes || 0) / most) * 100}%` }} /></i>
                    <b>{o.votes || 0}</b>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!group.closed && (
            <button type="button" className="gp-link" onClick={() => setEditing(true)}>
              Change my answer
            </button>
          )}
        </div>
      ) : (
        <form className="gp-card" onSubmit={send} noValidate>
          {group.options.length > 0 && (
            <div className="gp-field">
              <p className="gp-q">1. Which design do you like?</p>
              <div className="gp-opts" role="radiogroup" aria-label="Which design do you like?">
                {group.options.map((o) => (
                  <button key={o.n} type="button" role="radio" aria-checked={form.vote === o.n} className={`gp-opt${form.vote === o.n ? " on" : ""}`} onClick={() => set({ vote: o.n })}>
                    <i>{o.n}</i>
                    <span>{o.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="gp-field">
            <span className="gp-q">{step(2)}. Your name <small>(as it should be printed)</small></span>
            <input value={form.name} maxLength={24} autoComplete="given-name" placeholder="Your name" onChange={(e) => set({ name: e.target.value })} />
          </label>
          {group.sizes.length > 0 && (
            <div className="gp-field">
              <p className="gp-q">{step(3)}. Your size</p>
              <div className="gp-sizes" role="radiogroup" aria-label="Your size">
                {group.sizes.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={form.size === s} className={`gp-size${form.size === s ? " on" : ""}`} onClick={() => set({ size: s })}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {group.askNumber && (
            <label className="gp-field">
              <span className="gp-q">{step(group.sizes.length ? 4 : 3)}. Number on your tee <small>(leave empty for none)</small></span>
              <input value={form.number} inputMode="numeric" maxLength={4} placeholder="10" onChange={(e) => set({ number: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })} />
            </label>
          )}
          {error && <p className="gp-err" role="alert">{error}</p>}
          <button type="submit" className="gp-send" disabled={busy}>
            {busy ? "Sending…" : mine ? "Save my new answer" : "Send my answer"}
          </button>
          {mine && (
            <button type="button" className="gp-link" onClick={() => setEditing(false)}>
              Keep my old answer
            </button>
          )}
        </form>
      )}

      <Link className="gp-own" to={SHOPS.create.to}>
        <b>Want a tee of your own? →</b>
        <span>Design one yourself at IDENTEE: your words, your pictures.</span>
      </Link>
    </>,
  );
}

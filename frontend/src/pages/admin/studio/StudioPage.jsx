// Admin → Shop your IDENTEE → Studio (25 Oct 2026)
//
// Design one tee at a time by hand and publish it to Shop your IDENTEE. This page picks the product and its colour
// (and lists the tees made here so far); the room itself is StudioRoom.jsx. /admin/studio/:id opens a saved tee.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import studioService from "../../../services/studioService";
import { modelForGarment } from "../../../studio/teeModel";
import { hasWebGL } from "../../../studio/webgl";
import { imageUrl } from "../../../utils/imageUrl";
import { shopHref } from "../../../utils/siteUrls";
import StudioRoom from "./StudioRoom";
import { clearDraft, readDraft } from "./studioBits";
import "./studio.css";

const apiError = (err) => err?.response?.data?.message || err?.message || "Something went wrong. Please try again.";
const rupees = (n) => `₹${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN")}`;
const when = (d) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const STATUS_TEXT = { drafted: "Draft", ready: "Ready to publish", published: "In the shop", rejected: "Rejected", planned: "Draft", failed: "Draft" };
const webgl = typeof window !== "undefined" && hasWebGL();

export default function StudioPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [setup, setSetup] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [error, setError] = useState("");
  const [room, setRoom] = useState(null); // { garment, colourSlug, design, draft }
  const openingRef = useRef(null); // the saved tee being opened from /admin/studio/:id
  const [busyId, setBusyId] = useState(null);
  const [colourFor, setColourFor] = useState({}); // garment key -> colour slug picked on its card

  const load = useCallback(() => {
    Promise.all([studioService.getSetup(), studioService.listDesigns()])
      .then(([s, list]) => {
        setSetup(s);
        setDesigns(list);
        setError("");
      })
      .catch((err) => setError(apiError(err)));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const garments = useMemo(() => (setup?.garments || []).map((g) => ({ ...g, model: modelForGarment(g) })), [setup]);
  const draft = useMemo(() => readDraft(), [room]); // eslint-disable-line react-hooks/exhaustive-deps

  // /admin/studio/:id — open that tee
  useEffect(() => {
    if (!id || !setup || room || openingRef.current === id) return;
    openingRef.current = id;
    studioService
      .getDesign(id)
      .then((design) => {
        const garment = garments.find((g) => g.key === design.garmentType);
        if (!garment) return setError("This tee's product is not live any more (Admin → Create your IDENTEE).");
        const kept = readDraft();
        setRoom({ garment, colourSlug: design.color, design, draft: kept?.designId === design._id ? kept : null });
      })
      .catch((err) => setError(apiError(err)));
  }, [id, setup, garments, room]);

  const open = (garment, colourSlug, { design = null, keep = null } = {}) => {
    if (!webgl) return setError("This browser can't show the 3D tee. Open the Studio in Chrome or Edge on a laptop.");
    setRoom({ garment, colourSlug, design, draft: keep });
    if (design) navigate(`/admin/studio/${design._id}`, { replace: true });
    else if (id) navigate("/admin/studio", { replace: true });
  };
  const leave = (design) => {
    setRoom(null);
    if (design) {
      clearDraft();
      setDesigns((cur) => (cur.some((d) => d._id === design._id) ? cur.map((d) => (d._id === design._id ? design : d)) : [design, ...cur]));
    }
    navigate("/admin/studio", { replace: true });
    load();
  };
  const act = async (design, action) => {
    setBusyId(design._id);
    try {
      if (action === "delete") {
        if (!window.confirm(`Delete “${design.name}”? This can't be undone.`)) return;
        await studioService.removeDesign(design._id);
        setDesigns((cur) => cur.filter((d) => d._id !== design._id));
      } else {
        const doc = await studioService.act(design._id, action);
        setDesigns((cur) => cur.map((d) => (d._id === doc._id ? doc : d)));
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  if (room) return <StudioRoom key={`${room.garment.key}:${room.design?._id || "new"}`} setup={setup} garment={room.garment} colourSlug={room.colourSlug} design={room.design} draft={room.draft} onLeave={leave} />;

  const draftGarment = draft && !draft.designId && garments.find((g) => g.key === draft.garment);
  return (
    <div className="st-page">
      <p className="st-kicker">Shop your IDENTEE</p>
      <h1 className="st-title">Studio</h1>
      <p className="st-lead">
        Design one tee at a time, by hand, on the 3D tee with its true print areas. The picture assistant draws pictures when you ask (Google; Grok only for a real person) — you place every one. When it looks right, Review takes the four pictures and Publish puts it in Shop your IDENTEE, printed after each order.
      </p>
      {error && <p className="st-error" role="alert">{error}</p>}
      {!setup && !error && <p className="st-note">Opening the Studio…</p>}

      {draftGarment && draft.elements?.length > 0 && (
        <div className="st-continue">
          <div>
            <b>You were working on a {draftGarment.label}</b>
            <small>{draft.elements.length} item{draft.elements.length === 1 ? "" : "s"} · {when(draft.at)} · not saved yet</small>
          </div>
          <div className="st-row">
            <button type="button" className="st-btn st-btn-dark" onClick={() => open(draftGarment, draft.colour, { keep: draft })}>Continue</button>
            <button type="button" className="st-btn" onClick={() => { clearDraft(); setRoom(null); load(); }}>Forget it</button>
          </div>
        </div>
      )}

      {setup && (
        <>
          <h2 className="st-h2">1 · Pick the product</h2>
          <div className="st-products">
            {garments.map((g) => {
              const slug = colourFor[g.key] || g.colours[0]?.slug;
              const colour = g.colours.find((c) => c.slug === slug) || g.colours[0];
              return (
                <article key={g.key} className={`st-product${g.model ? "" : " flat"}`}>
                  <div className="st-product-head">
                    <b>{g.label}</b>
                    <small>{g.positions.length} print areas · {g.colours.length} colour{g.colours.length === 1 ? "" : "s"}</small>
                  </div>
                  <div className="st-swatches" role="radiogroup" aria-label={`${g.label} colour`}>
                    {g.colours.map((c) => (
                      <button key={c.slug} type="button" role="radio" aria-checked={c.slug === colour?.slug} aria-label={c.name} title={c.name} className={`st-sw${c.slug === colour?.slug ? " on" : ""}`} style={{ background: c.hex }} onClick={() => setColourFor((cur) => ({ ...cur, [g.key]: c.slug }))} />
                    ))}
                  </div>
                  <div className="st-product-foot">
                    <span className="st-note">{colour?.name}</span>
                    {g.model ? (
                      <button type="button" className="st-btn st-btn-primary" disabled={!colour} onClick={() => open(g, colour.slug)}>
                        Open the studio →
                      </button>
                    ) : (
                      <span className="st-note">No 3D model for this product yet</span>
                    )}
                  </div>
                </article>
              );
            })}
            {!garments.length && <p className="st-note">No live products. Make one live in Admin → Create your IDENTEE first.</p>}
          </div>

          <h2 className="st-h2">Tees made in the Studio</h2>
          {!designs.length && <p className="st-note">Nothing yet. Open the studio above and design your first tee.</p>}
          <div className="st-list">
            {designs.map((d) => {
              const g = garments.find((x) => x.key === d.garmentType);
              const colour = g?.colours.find((c) => c.slug === d.color);
              const hero = (d.elements || []).find((e) => e.type === "image")?.side === "back" ? "back" : "front";
              const pic = d.mockups?.[hero] || d.mockups?.front;
              const busy = busyId === d._id;
              return (
                <article key={d._id} className="st-tee">
                  <div className="st-tee-pic">{pic ? <img src={imageUrl(pic, 500)} alt={d.name} /> : <span className="st-note">No picture yet</span>}</div>
                  <div className="st-tee-body">
                    <div className="st-tee-head">
                      <b>{d.name}</b>
                      <span className={`st-badge st-badge-${d.status}`}>{STATUS_TEXT[d.status] || d.status}</span>
                    </div>
                    <small className="st-note">
                      {colour && <i className="st-dot" style={{ background: colour.hex }} />}
                      {[g?.label || d.garmentType, colour?.name || d.color].join(" · ")} · {when(d.updatedAt)}
                      {d.costInr ? ` · AI ${rupees(d.costInr)}` : ""}
                    </small>
                    {d.issues?.length > 0 && <small className="st-note st-warn">⚠ {d.issues.length} print-check note{d.issues.length === 1 ? "" : "s"}</small>}
                    <div className="st-row">
                      {g && (
                        <button type="button" className="st-btn st-btn-small st-btn-dark" disabled={busy} onClick={() => open(g, d.color, { design: d })}>
                          {d.status === "published" ? "Edit" : "Open"}
                        </button>
                      )}
                      {d.status === "ready" && (
                        <button type="button" className="st-btn st-btn-small st-btn-primary" disabled={busy} onClick={() => act(d, "publish")}>
                          Publish
                        </button>
                      )}
                      {d.status === "published" && (
                        <>
                          <a className="st-btn st-btn-small" href={shopHref(`/ready-made/design/${d.slug}`)} target="_blank" rel="noreferrer">
                            See in shop
                          </a>
                          <button type="button" className="st-btn st-btn-small" disabled={busy} onClick={() => act(d, "unpublish")}>
                            Unpublish
                          </button>
                        </>
                      )}
                      {d.status !== "published" && (
                        <button type="button" className="st-btn-link st-danger" disabled={busy} onClick={() => act(d, "delete")}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

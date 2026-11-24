// Admin → Design Studio → Studio (25 Oct 2026; its own menu section since 5 Nov 2026)
//
// Design one tee at a time by hand and publish it to Shop your IDENTEE. This page picks the product and its colour
// (and lists the tees made here so far); the room itself is StudioRoom.jsx. /admin/studio/:id opens a saved tee.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import studioService from "../../../services/studioService";
import customizationService from "../../../services/customizationService";
import MockupCamera from "../../../studio/MockupCamera";
import { withSpots } from "../../../studio/panelModel";
import { modelForGarment } from "../../../studio/teeModel";
import { hasWebGL } from "../../../studio/webgl";
import { imageUrl } from "../../../utils/imageUrl";
import { shopHref } from "../../../utils/siteUrls";
import ListShopTees from "./ListShopTees";
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

  // (24 Nov 2026, the owner: "remove all the SCENE t-shirts from the shop") a whole collection out of the shop — or back
  // in — in one press: each of its tees is unpublished (kept here, its orders untouched) / published again. "Back in"
  // only takes tees that were in the shop before (publishedAt), never a draft.
  const collections = useMemo(() => {
    const map = new Map();
    for (const d of designs) {
      const parts = String(d.name || "").split(" · ");
      if (parts.length < 2) continue;
      const key = parts[0].trim();
      if (!map.has(key)) map.set(key, { key, live: [], out: [] });
      if (d.status === "published") map.get(key).live.push(d);
      else if (d.status === "ready" && d.publishedAt) map.get(key).out.push(d);
    }
    return [...map.values()];
  }, [designs]);
  const [bulk, setBulk] = useState(null); // { key, done, total }
  const bulkAct = async (c, action) => {
    const list = action === "unpublish" ? c.live : c.out;
    const words = action === "unpublish" ? `Take all ${list.length} ${c.key} tees out of the shop? They stay here and can be put back.` : `Put ${list.length} ${c.key} tees back in the shop?`;
    if (!list.length || !window.confirm(words)) return;
    setBulk({ key: c.key, done: 0, total: list.length });
    let done = 0;
    for (const d of list) {
      try {
        const doc = await studioService.act(d._id, action);
        setDesigns((cur) => cur.map((x) => (x._id === doc._id ? doc : x)));
      } catch (err) {
        setError(`${d.name}: ${apiError(err)}`);
      }
      done += 1;
      setBulk({ key: c.key, done, total: list.length });
    }
    setBulk(null);
  };

  // (24 Nov 2026, the owner: "make the front image like this for all the tees in Shop your IDENTEE" — the SCENE tees on
  // a wooden hanger) a collection's tees in the shop get new pictures, the way Review takes them now: each print on the
  // garment's hanger photo, true to size. Every colour on sale is taken again; the design, price and details stay.
  const [shotJob, setShotJob] = useState(null);
  const shotDone = useRef(null);
  const shoot = (job) =>
    new Promise((resolve) => {
      shotDone.current = resolve;
      setShotJob({ ...job, id: `pic${Date.now()}${Math.random()}` });
    });
  const onShots = (pictures) => {
    setShotJob(null);
    const done = shotDone.current;
    shotDone.current = null;
    done?.(pictures);
  };
  const repicture = async (c) => {
    const list = c.live;
    if (!list.length || !window.confirm(`Make new pictures for the ${list.length} ${c.key} tees in the shop (on the hanger photo, every colour)? Keep this page open — about ${Math.max(1, Math.round((list.length * 6) / 60))} minutes.`)) return;
    setBulk({ key: c.key, done: 0, total: list.length });
    const where = new Map();
    const failed = [];
    let done = 0;
    for (const d of list) {
      try {
        const garment = garments.find((g) => g.key === d.garmentType);
        if (!garment) throw new Error("its product is not live");
        const full = await studioService.getDesign(d._id);
        if (!where.has(garment.key)) where.set(garment.key, await customizationService.getPrintPositions(garment.key));
        const { positions: catalog, maxPrint } = where.get(garment.key);
        const positions = withSpots(catalog, full.elements || [], garment, maxPrint);
        const slugs = (full.colours?.length ? full.colours.map((x) => x.slug) : [full.color]).filter((s) => garment.colours.some((x) => x.slug === s));
        const colours = [];
        for (const slug of slugs) {
          const colour = garment.colours.find((x) => x.slug === slug);
          const job = { garment, positions, size: full.size || "M", colourHex: colour.hex, colourSlug: slug, elements: full.elements || [] };
          const pics = (await shoot(job)) || (await shoot(job));
          if (!pics) throw new Error(`the pictures in ${colour.name} couldn't be taken`);
          colours.push({ slug, mockups: pics });
        }
        const doc = await studioService.saveDesign(
          {
            garmentType: full.garmentType,
            color: full.color,
            size: full.size,
            name: full.name,
            blurb: full.blurb,
            elements: full.elements,
            issues: full.issues,
            costInr: full.costInr,
            service: full.service,
            category: full.category,
            sizes: full.sizes,
            priceInr: full.priceInr,
            product: full.product,
            colours,
          },
          full._id,
        );
        setDesigns((cur) => cur.map((x) => (x._id === doc._id ? doc : x)));
      } catch (err) {
        failed.push(`${d.name}: ${apiError(err)}`);
      }
      done += 1;
      setBulk({ key: c.key, done, total: list.length });
    }
    setBulk(null);
    setError(failed.length ? `${failed.length} tee${failed.length === 1 ? "" : "s"} kept the old pictures — ${failed.slice(0, 5).join(" · ")}` : "");
  };

  if (room) return <StudioRoom key={`${room.garment.key}:${room.design?._id || "new"}`} setup={setup} garment={room.garment} colourSlug={room.colourSlug} design={room.design} draft={room.draft} onLeave={leave} />;

  const draftGarment = draft && !draft.designId && garments.find((g) => g.key === draft.garment);
  return (
    <div className="st-page">
      <p className="st-kicker">Design Studio</p>
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

          <h2 className="st-h2">Collections in the shop</h2>
          <div className="st-list" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))" }}>
            <ListShopTees onMade={load} />
          </div>
          {collections.length > 0 && (
            <>
              <div className="st-list" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", marginTop: 12 }}>
                {collections.map((c) => (
                  <article key={c.key} className="st-tee" style={{ display: "grid", gap: 8, padding: 14 }}>
                    <b>{c.key}</b>
                    <small className="st-note">
                      {c.live.length} in the shop{c.out.length ? ` · ${c.out.length} taken out` : ""}
                    </small>
                    {bulk?.key === c.key ? (
                      <small className="st-note">Working… {bulk.done} / {bulk.total}</small>
                    ) : (
                      <div className="st-row">
                        {c.live.length > 0 && (
                          <button type="button" className="st-btn st-btn-small" disabled={Boolean(bulk)} onClick={() => bulkAct(c, "unpublish")}>
                            Take all out of the shop
                          </button>
                        )}
                        {c.out.length > 0 && (
                          <button type="button" className="st-btn st-btn-small st-btn-primary" disabled={Boolean(bulk)} onClick={() => bulkAct(c, "publish")}>
                            Put back in the shop
                          </button>
                        )}
                        {c.live.length > 0 && (
                          <button type="button" className="st-btn st-btn-small" disabled={Boolean(bulk)} onClick={() => repicture(c)}>
                            New pictures (hanger photo)
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}

          {shotJob && <MockupCamera key={shotJob.id} job={shotJob} onDone={onShots} />}
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

// pages/admin/ArtBulkUploadPage.jsx — "Add many designs" (Design library)
//
// Many art pictures at once, without an Excel sheet:
//   1. pick a category, or type a new one (made on upload, with the first picture as its thumbnail)
//   2. drop the pictures (or a folder, or a .zip of them)
//   3. check the grid: a name is filled in from each file name (number-only names become "Car 1", "Car 2"…);
//      exact copies, names already in the category and pictures without a see-through background start unticked
//   4. upload: each picture is made smaller in the browser first (3,200 px on its longest side — still sharp on
//      the biggest print area, Full Front 35 × 52 cm at 150 dpi) and sent on its own, so one bad picture
//      doesn't stop the rest; "Retry failed" sends the ones that didn't go.
// No price: every picture on a tee costs the same (the shop's flat picture charge), so designs are saved at 0.
// (Uses the normal one-design / one-category endpoints — server/routes/artDesignRoutes.js, artCategoryRoutes.js.)
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import artCategoryService from "../../services/artCategoryService";
import artDesignService from "../../services/artDesignService";
import { AW } from "./garmentSetup/wizardStyles";
import { useReportUnsaved } from "../../utils/unsavedChanges";

const MAX_SIDE = 3200; // px — sharp (150 dpi) on a 52 cm print
const SMALL_SIDE = 1500; // px — below this it's only sharp on small prints (a chest logo)
const KEEP_AS_IS_BYTES = 8 * 1024 * 1024; // a picture already this small and not too big in pixels is sent untouched
const ZIP_MAX_BYTES = 400 * 1024 * 1024; // bigger zips: unzip on the computer and drop the folder (a browser can't hold 1 GB)
const PICTURE = /\.(png|jpe?g|webp)$/i;
const AT_ONCE = 3; // pictures made smaller and sent at the same time (each one takes a few seconds to reach Cloudinary)

const CSS = `
  .ab-drop { border: 2px dashed #CDBF9F; border-radius: 16px; background: #FBF8F1; padding: 28px 16px; text-align: center; cursor: pointer; }
  .ab-drop.on { border-color: #C9A24B; background: #FFF8E6; }
  .ab-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 168px), 1fr)); gap: 12px; }
  .ab-item { display: grid; gap: 8px; padding: 10px; border: 1px solid #E7DFCC; border-radius: 14px; background: #fff; align-content: start; }
  .ab-item.off { opacity: .55; }
  .ab-thumb { position: relative; aspect-ratio: 1 / 1; border-radius: 10px; overflow: hidden; display: grid; place-items: center;
    background: repeating-conic-gradient(#EFE8D8 0% 25%, #fff 0% 50%) 50% / 18px 18px; }
  .ab-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
  .ab-tick { position: absolute; top: 6px; left: 6px; width: 34px; height: 34px; accent-color: #141110; cursor: pointer; }
  .ab-state { position: absolute; right: 6px; bottom: 6px; font: 800 11px 'Inter', sans-serif; padding: 3px 8px; border-radius: 999px; background: #141110; color: #fff; }
  .ab-state.done { background: #2E7D4F; } .ab-state.failed { background: #A3341F; }
  .ab-name { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #D7CCB3; border-radius: 9px; font: 600 13px 'Inter', sans-serif; min-height: 40px; }
  .ab-warn { font-size: 12px; line-height: 1.35; color: #7A5B12; background: #FBEFD2; border-radius: 8px; padding: 5px 8px; }
  .ab-warn.bad { color: #7A2A1A; background: #F8E1DA; }
  .ab-meta { font-size: 11.5px; color: #7A7062; overflow-wrap: anywhere; }
  .ab-bar { position: sticky; bottom: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between;
    padding: 12px 14px; margin-top: 16px; background: #fff; border: 1px solid #E7DFCC; border-radius: 14px; box-shadow: 0 -10px 30px -18px rgba(20,17,16,.35); }
  .ab-progress { height: 8px; border-radius: 99px; background: #F0EADB; overflow: hidden; flex: 1 1 100%; }
  .ab-progress span { display: block; height: 100%; background: #C9A24B; transition: width .3s ease; }
`;

// ── reading the files ───────────────────────────────────────────────────────────────────────────────────────
// a quick fingerprint of the file's bytes, to spot exact copies (works on any page, secure or not)
function fingerprint(buf) {
  const b = new Uint8Array(buf);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < b.length; i++) {
    h1 = Math.imul(h1 ^ b[i], 16777619);
    h2 = Math.imul(h2 ^ b[i], 2246822519) ^ (h2 >>> 13);
  }
  return `${b.length}:${(h1 >>> 0).toString(16)}:${(h2 >>> 0).toString(16)}`;
}

// PNG: size and whether it can be see-through, straight from the file's header (no need to open the picture)
function pngInfo(buf) {
  const b = new Uint8Array(buf);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (b.length < 33 || sig.some((v, i) => b[i] !== v)) return null;
  const dv = new DataView(buf);
  const w = dv.getUint32(16), h = dv.getUint32(20), type = b[25];
  let alpha = type === 4 || type === 6;
  if (!alpha && type === 3) {
    // a palette picture is see-through only if it has a tRNS chunk (before the picture data)
    for (let p = 8; p + 8 < b.length; ) {
      const len = dv.getUint32(p);
      const name = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
      if (name === "tRNS") { alpha = true; break; }
      if (name === "IDAT") break;
      p += 12 + len;
    }
  }
  return { w, h, alpha };
}

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This picture can't be opened"));
    img.src = src;
  });

// a design's name from its file name: "audi R.png" → "Audi R"; "02 (86).png", "AUTO (3).png" → "" (numbered later)
const GENERIC = /^(\d+|auto|recurso|proyecto|image|img|untitled|copy|design|c|photo|pic)(\s*\d+)?$/i;
function nameFrom(fileName) {
  const s = fileName
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_ ]*\bpng\b/gi, " ") // "mclaren-PNG TRASERO" → "mclaren TRASERO"
    .replace(/[_]+/g, " ")
    .replace(/\(\s*\d*\s*\)/g, " ") // "(1)", "()" — copy markers
    .replace(/^\d+\s+(?=\D)/, "") // "3 CHALLENGER" → "CHALLENGER"
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < 2 || GENERIC.test(s)) return "";
  return s.replace(/(^|\s)([a-z])/g, (m, sp, ch) => sp + ch.toUpperCase()).slice(0, 60);
}

// one name per picture, none repeated: blanks become "Car 1", "Car 2"… (from the category: "Cars" → "Car").
// The ticked pictures are numbered first (the list keeps its order), and numbers already used in the category are
// skipped — a second batch carries on from "Car 8" instead of clashing with the first batch's "Car 1".
function giveNames(items, categoryName, taken = new Set()) {
  const base = (categoryName.trim() || "Design").replace(/s$/i, "") || "Design";
  const used = new Set();
  let n = 0;
  const order = [...items.keys()].sort((a, b) => Number(!(items[a].include || items[a].status === "done")) - Number(!(items[b].include || items[b].status === "done")) || a - b);
  const out = new Array(items.length);
  for (const i of order) out[i] = nameOne(items[i]);
  return out;
  function nameOne(it) {
    if (it.nameEdited) {
      used.add(it.name.toLowerCase());
      return it;
    }
    let name = it.fromFile;
    if (!name) {
      do n += 1; while (used.has(`${base} ${n}`.toLowerCase()) || taken.has(`${base} ${n}`.toLowerCase()));
      name = `${base} ${n}`;
    }
    let k = 2;
    const plain = name;
    while (used.has(name.toLowerCase())) name = `${plain} ${k++}`;
    used.add(name.toLowerCase());
    return { ...it, name };
  }
}

// pictures whose name is already a design in that category start unticked (they would be twice in the library)
function untickExisting(list, catId, catName, existing) {
  if (!catId) return list;
  const there = new Set(existing.filter((d) => d.category === catId).map((d) => d.name));
  const names = giveNames(list, catName, there);
  const sent = readSent(catId);
  return list.map((it, i) => (!it.status && (there.has(names[i].name.toLowerCase()) || sent.has(it.hash)) ? { ...it, include: false, sentBefore: sent.has(it.hash) } : it));
}

// ── making a picture smaller before it's sent ─────────────────────────────────────────────────────────────
async function shrink(item) {
  const { file, w, h } = item;
  const longest = Math.max(w || 0, h || 0);
  if (longest && longest <= MAX_SIDE && file.size <= KEEP_AS_IS_BYTES && /png|webp/i.test(file.type)) return file;
  const k = longest ? Math.min(1, MAX_SIDE / longest) : 1;
  const tw = Math.max(1, Math.round((w || MAX_SIDE) * k)), th = Math.max(1, Math.round((h || MAX_SIDE) * k));
  let src;
  try {
    // let the browser shrink while opening (much less memory for a 8,000 px picture)
    src = await createImageBitmap(file, { resizeWidth: tw, resizeHeight: th, resizeQuality: "high" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      src = await loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, tw, th);
  src.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  canvas.width = canvas.height = 0; // let the memory go
  if (!blob) throw new Error("The picture couldn't be made smaller");
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" });
}

// a small square picture for a new category's thumbnail
async function thumbnailOf(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const size = 600, k = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return new File([blob], "thumbnail.png", { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// fingerprints of the pictures already uploaded from this device, per category: dropping the same files again
// (an upload stopped half-way and finished later) leaves them unticked, even the ones that only have a number
const SENT_KEY = (catId) => `identee:artSent:${catId}`;
const readSent = (catId) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SENT_KEY(catId)) || "[]"));
  } catch {
    return new Set();
  }
};
const rememberSent = (catId, hash) => {
  try {
    const all = readSent(catId);
    all.add(hash);
    localStorage.setItem(SENT_KEY(catId), JSON.stringify([...all].slice(-3000)));
  } catch {
    // (storage full or blocked: only this reminder is lost)
  }
};

const errText = (err) => err?.response?.data?.message || err?.message || "Upload failed";
let nextId = 1;

export default function ArtBulkUploadPage() {
  const [categories, setCategories] = useState([]);
  const [existing, setExisting] = useState([]); // designs already in the library: { name, category }
  const [catId, setCatId] = useState(""); // "" = a new category
  const [newCat, setNewCat] = useState("");
  const [items, setItems] = useState([]);
  const [reading, setReading] = useState(null); // { done, total } while the files are checked
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [show, setShow] = useState("all"); // all | upload | skipped | warn
  const stopRef = useRef(false);
  const fileRef = useRef(null);
  const folderRef = useRef(null);

  useEffect(() => {
    artCategoryService.getArtCategories().then(setCategories).catch(() => toast.error("Couldn't load the art categories"));
    artDesignService
      .getAllArtDesignsAdmin()
      .then((all) => setExisting((Array.isArray(all) ? all : all?.designs || []).map((d) => ({ name: String(d.name || "").toLowerCase(), category: String(d.category?._id || d.category || "") }))))
      .catch(() => {});
  }, []);

  // object URLs for the thumbnails are let go when the page closes
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => () => itemsRef.current.forEach((it) => URL.revokeObjectURL(it.preview)), []);

  const category = categories.find((c) => c._id === catId);
  const categoryName = category ? category.name : newCat;
  const sameNameCat = !catId && newCat.trim() && categories.find((c) => c.name.trim().toLowerCase() === newCat.trim().toLowerCase());

  // names and "already there" follow the chosen category
  const named = useMemo(() => {
    const there = new Set(existing.filter((d) => catId && d.category === catId).map((d) => d.name));
    const withNames = giveNames(items, categoryName, there);
    return withNames.map((it) => ({ ...it, exists: it.status !== "done" && there.has(it.name.toLowerCase()) }));
  }, [items, categoryName, existing, catId]);

  const pending = named.filter((it) => it.include && it.status !== "done");
  const done = named.filter((it) => it.status === "done").length;
  const failed = named.filter((it) => it.status === "failed").length;
  const warnCount = named.filter((it) => it.dupOf || it.exists || it.sentBefore || it.alpha === false || it.small).length;
  // leaving the page asks first while pictures are chosen but not uploaded (or are uploading)
  useReportUnsaved(uploading || pending.length > 0, "pictures not uploaded yet");

  const patch = (id, change) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...change } : it)));

  // ── adding files ──
  const addFiles = async (fileList) => {
    let files = [...fileList];
    const zips = files.filter((f) => /\.zip$/i.test(f.name));
    files = files.filter((f) => PICTURE.test(f.name));
    for (const z of zips) {
      if (z.size > ZIP_MAX_BYTES) {
        toast.error(`${z.name} is ${Math.round(z.size / 1e6)} MB — too big to open in the browser. Unzip it on the computer and drop the folder (or the pictures) instead.`, { autoClose: 12000 });
        continue;
      }
      try {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(z);
        for (const entry of Object.values(zip.files)) {
          if (entry.dir || entry.name.includes("__MACOSX") || !PICTURE.test(entry.name)) continue;
          const blob = await entry.async("blob");
          const ext = entry.name.split(".").pop().toLowerCase();
          files.push(new File([blob], entry.name.split("/").pop(), { type: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg" }));
        }
      } catch {
        toast.error(`${z.name} couldn't be opened as a zip`);
      }
    }
    if (!files.length) {
      if (!zips.length) toast.error("No pictures there — PNG, JPG or WEBP files only");
      return;
    }
    setReading({ done: 0, total: files.length });
    const seen = new Map(items.map((it) => [it.hash, it]));
    const added = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const buf = await file.arrayBuffer();
        const hash = fingerprint(buf);
        let info = /png$/i.test(file.name) ? pngInfo(buf) : null;
        if (!info) {
          const url = URL.createObjectURL(file);
          try {
            const img = await loadImage(url);
            info = { w: img.naturalWidth, h: img.naturalHeight, alpha: /\.jpe?g$/i.test(file.name) ? false : null };
          } finally {
            URL.revokeObjectURL(url);
          }
        }
        const first = seen.get(hash);
        const it = {
          id: nextId++,
          file,
          hash,
          preview: URL.createObjectURL(file),
          fromFile: nameFrom(file.name),
          name: "",
          nameEdited: false,
          w: info.w,
          h: info.h,
          alpha: info.alpha,
          small: Math.max(info.w, info.h) < SMALL_SIDE,
          dupOf: first ? first.file.name : "",
          include: !first && info.alpha !== false,
          status: "",
          error: "",
        };
        if (!first) seen.set(hash, it);
        added.push(it);
      } catch {
        added.push({ id: nextId++, file, hash: `bad:${i}`, preview: "", fromFile: nameFrom(file.name), name: "", nameEdited: false, w: 0, h: 0, alpha: null, small: false, dupOf: "", include: false, status: "failed", error: "This picture can't be opened" });
      }
      if (i % 4 === 3 || i === files.length - 1) setReading({ done: i + 1, total: files.length });
    }
    setItems((list) => untickExisting([...list, ...added], catId, categoryName, existing));
    setReading(null);
  };


  // ── uploading ──
  const upload = async (retry = false) => {
    if (!catId && !newCat.trim()) return toast.error("Pick a category, or type a name for a new one");
    if (sameNameCat) return toast.error(`There is already a category called "${sameNameCat.name}" — pick it from the list`);
    // retry: only the ones that didn't go; otherwise every ticked picture not uploaded yet
    const todo = named.filter((it) => (retry ? it.status === "failed" && it.preview : it.include && it.status !== "done"));
    if (!todo.length) return toast.error("Tick at least one picture");
    setUploading(true);
    stopRef.current = false;
    let cat = catId;
    try {
      if (!cat) {
        const made = await artCategoryService.createArtCategory(newCat.trim(), await thumbnailOf(todo[0].file));
        cat = made._id;
        setCategories((list) => [...list, made]);
        setCatId(made._id);
        setNewCat("");
      }
    } catch (err) {
      setUploading(false);
      return toast.error(`The category couldn't be made: ${errText(err)}`);
    }
    let ok = 0, bad = 0, next = 0;
    // a few at a time: each worker takes the next picture until none are left (or Stop was pressed)
    const worker = async () => {
      while (!stopRef.current && next < todo.length) {
        const it = todo[next++];
        patch(it.id, { status: "uploading", error: "" });
        try {
          const small = await shrink(it);
          await artDesignService.createArtDesign(it.name, cat, 0, small);
          patch(it.id, { status: "done", name: it.name, nameEdited: true }); // (its name stays as uploaded)
          setExisting((list) => [...list, { name: it.name.toLowerCase(), category: String(cat) }]);
          rememberSent(cat, it.hash);
          ok++;
        } catch (err) {
          patch(it.id, { status: "failed", error: errText(err) });
          bad++;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, todo.length) }, worker));
    setUploading(false);
    if (bad) toast.error(`${ok} uploaded, ${bad} didn't go — press "Retry failed" to send them again.`, { autoClose: 9000 });
    else if (ok) toast.success(`${ok} design${ok === 1 ? "" : "s"} added`);
  };

  const retryFailed = () => upload(true);

  const shown = named.filter((it) =>
    show === "upload" ? it.include && it.status !== "done" : show === "skipped" ? !it.include : show === "warn" ? it.dupOf || it.exists || it.sentBefore || it.alpha === false || it.small : true,
  );
  const busy = uploading || Boolean(reading);
  const total = named.filter((it) => it.include || it.status === "done").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div style={{ ...AW.page, padding: "8px 4px 24px" }}>
      <style>{AW.css + CSS}</style>
      <h1 style={AW.h1}>Add many designs</h1>
      <p style={AW.lead}>Drop the pictures, check the names, upload. No Excel sheet, and no price — every picture on a tee costs the same.</p>

      {/* 1. category */}
      <section className="aw-card" style={{ padding: 16, marginTop: 18, display: "grid", gap: 12 }}>
        <h2 style={AW.h2}>1. Category</h2>
        <div className="aw-two">
          <div>
            <label className="aw-lbl" htmlFor="ab-cat">Put them in</label>
            <select id="ab-cat" className="aw-inp" value={catId} disabled={busy} onChange={(e) => {
              const id = e.target.value;
              setCatId(id);
              setItems((list) => untickExisting(list, id, categories.find((c) => c._id === id)?.name || "", existing));
            }}>
              <option value="">A new category…</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>
          {!catId && (
            <div>
              <label className="aw-lbl" htmlFor="ab-new">New category name</label>
              <input id="ab-new" className="aw-inp" value={newCat} maxLength={40} disabled={busy} placeholder="Cars" onChange={(e) => setNewCat(e.target.value)} />
              <p className="aw-help">{sameNameCat ? <b style={{ color: "#A3341F" }}>“{sameNameCat.name}” already exists — pick it from the list instead.</b> : "Made when you upload; its picture is the first design."}</p>
            </div>
          )}
        </div>
      </section>

      {/* 2. pictures */}
      <section className="aw-card" style={{ padding: 16, marginTop: 14, display: "grid", gap: 12 }}>
        <h2 style={AW.h2}>2. Pictures</h2>
        <div
          className={`ab-drop${dragging ? " on" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => !busy && fileRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) addFiles(e.dataTransfer.files); }}
        >
          <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>Drop pictures here, or tap to choose</p>
          <p className="aw-help" style={{ marginTop: 6 }}>PNG with a see-through background is best. A folder or a .zip (up to 400 MB) works too.</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="aw-btn light" disabled={busy} onClick={() => fileRef.current?.click()}>Choose pictures</button>
          <button type="button" className="aw-btn light" disabled={busy} onClick={() => folderRef.current?.click()}>Choose a folder</button>
          {items.length > 0 && (
            <button type="button" className="aw-btn light" disabled={busy} onClick={() => { items.forEach((it) => URL.revokeObjectURL(it.preview)); setItems([]); }}>Clear all</button>
          )}
        </div>
        <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,.zip,application/zip" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={folderRef} type="file" multiple webkitdirectory="" directory="" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        {reading && <p className="aw-help" role="status">Checking the pictures… {reading.done} of {reading.total}</p>}
      </section>

      {/* 3. check */}
      {named.length > 0 && (
        <section className="aw-card" style={{ padding: 16, marginTop: 14, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={AW.h2}>3. Check the names</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[["all", `All ${named.length}`], ["upload", `To upload ${pending.length}`], ["skipped", `Skipped ${named.filter((it) => !it.include).length}`], ["warn", `Look at ${warnCount}`]].map(([k, label]) => (
                <button key={k} type="button" className={`aw-chip${show === k ? " on" : ""}`} onClick={() => setShow(k)}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="aw-btn light" disabled={busy} onClick={() => setItems((l) => l.map((it) => (shown.some((s) => s.id === it.id) && it.status !== "done" ? { ...it, include: true } : it)))}>Tick these</button>
            <button type="button" className="aw-btn light" disabled={busy} onClick={() => setItems((l) => l.map((it) => (shown.some((s) => s.id === it.id) && it.status !== "done" ? { ...it, include: false } : it)))}>Untick these</button>
          </div>
          <div className="ab-grid">
            {shown.map((it) => (
              <div key={it.id} className={`ab-item${it.include || it.status === "done" ? "" : " off"}`}>
                <div className="ab-thumb">
                  {it.preview ? <img src={it.preview} alt="" loading="lazy" decoding="async" /> : <span className="ab-meta">Can't show</span>}
                  {it.status !== "done" && (
                    <input type="checkbox" className="ab-tick" aria-label={`Upload ${it.name}`} checked={it.include} disabled={busy || !it.preview} onChange={(e) => patch(it.id, { include: e.target.checked })} />
                  )}
                  {it.status && <span className={`ab-state ${it.status}`}>{it.status === "uploading" ? "Sending…" : it.status === "done" ? "Added" : "Didn't go"}</span>}
                </div>
                <input
                  className="ab-name"
                  aria-label="Design name"
                  value={it.name}
                  maxLength={60}
                  disabled={busy || it.status === "done"}
                  onChange={(e) => patch(it.id, { name: e.target.value, nameEdited: true })}
                />
                <span className="ab-meta">{it.file.name} · {it.w}×{it.h}</span>
                {it.dupOf && <span className="ab-warn">Same picture as {it.dupOf}</span>}
                {it.sentBefore && it.status !== "done" && <span className="ab-warn">Already uploaded to {categoryName} from this device</span>}
                {it.exists && !it.sentBefore && <span className="ab-warn">“{it.name}” is already in {categoryName}</span>}
                {it.alpha === false && <span className="ab-warn bad">No see-through background — prints as a box</span>}
                {it.small && <span className="ab-warn">Small ({Math.max(it.w, it.h)} px): sharp on small prints only</span>}
                {it.status === "failed" && <span className="ab-warn bad">{it.error}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. upload */}
      {named.length > 0 && (
        <div className="ab-bar">
          <div style={{ minWidth: 0 }}>
            <b style={{ fontSize: 15 }}>
              {uploading ? `Uploading ${done} of ${total}…` : done ? `${done} added${failed ? ` · ${failed} didn't go` : ""}` : `${pending.length} picture${pending.length === 1 ? "" : "s"} to upload`}
            </b>
            <p className="aw-help" style={{ margin: "2px 0 0" }}>{categoryName ? `Into “${categoryName}”` : "Pick a category first"}{uploading ? " — keep this page open" : ""}</p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {uploading ? (
              <button type="button" className="aw-btn light" onClick={() => { stopRef.current = true; }}>Stop</button>
            ) : (
              <>
                {failed > 0 && <button type="button" className="aw-btn light" onClick={retryFailed}>Retry failed</button>}
                {done > 0 && <Link to="/admin/art-designs" className="aw-btn light">See the designs</Link>}
                <button type="button" className="aw-btn gold" disabled={busy || !pending.length} onClick={() => upload()}>
                  Upload {pending.length} picture{pending.length === 1 ? "" : "s"}
                </button>
              </>
            )}
          </div>
          {(uploading || done > 0) && (
            <div className="ab-progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
          )}
        </div>
      )}
    </div>
  );
}

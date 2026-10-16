// Admin → Orders → Print sheets
// The print team prints on 58 × 100 cm sheets, a whole day's orders at once. Pick a date: every custom-design order
// placed that day (India time, cancelled ones left out) is laid out on as few sheets as possible, previewed here,
// and downloaded as 300-DPI PNGs + a sheet list (studio/printSheets.js, made in this browser).
import { useEffect, useState } from "react";
import customizationService from "../../services/customizationService";
import { collectPieces, layOut, drawSheet, buildSheetsZip, SHEET, GAP } from "../../studio/printSheets";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
const when = (d) => new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const teesOf = (pack) => pack.designs.reduce((n, d) => n + (d.lines || []).reduce((m, l) => m + l.qty, 0), 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const css = `
  .psh { min-height: 100vh; background: #FFFFFF; color: #15130F; padding: 32px 40px 64px; font-family: Inter, system-ui, sans-serif; }
  .psh-eyebrow { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #9C7A2E; }
  .psh h1 { margin: 4px 0 6px; font: 700 28px/1.15 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; }
  .psh-lead { margin: 0 0 22px; max-width: 68ch; color: #6B6559; font-size: 14px; line-height: 1.55; }
  .psh-bar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 16px; margin-bottom: 18px; }
  .psh-bar label { display: grid; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #6B6559; }
  .psh-bar input { border: 1px solid #EAE3CF; background: #F7F4EC; border-radius: 8px; padding: 9px 12px; font: 600 14px Inter, sans-serif; color: #15130F; }
  .psh-btn { border: 0; border-radius: 999px; padding: 11px 20px; font: 700 14px Inter, sans-serif; cursor: pointer; background: #15130F; color: #fff; }
  .psh-btn.gold { background: #C9A24B; color: #15130F; }
  .psh-btn.line { background: #fff; color: #15130F; border: 1.5px solid #15130F; }
  .psh-btn:disabled { opacity: .5; cursor: default; }
  .psh-note { margin: 0 0 14px; padding: 10px 14px; border-radius: 10px; font-size: 13px; line-height: 1.5; }
  .psh-note.warn { background: #FDF3E1; border: 1px solid #F0D49B; color: #6A4A0C; }
  .psh-note.bad { background: #FBEAE7; border: 1px solid #EDB9AF; color: #8A2414; }
  .psh-note.ok { background: #EEF6EE; border: 1px solid #BFDCC1; color: #24502A; }
  .psh-stats { display: flex; flex-wrap: wrap; gap: 10px 28px; margin: 0 0 16px; font-size: 14px; color: #6B6559; }
  .psh-stats b { color: #15130F; font-size: 18px; margin-right: 4px; font-variant-numeric: tabular-nums; }
  .psh-table { width: 100%; max-width: 820px; border-collapse: collapse; font-size: 13px; margin-bottom: 22px; }
  .psh-table th { text-align: left; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #6B6559; padding: 8px 10px; border-bottom: 1px solid #EAE3CF; }
  .psh-table td { padding: 9px 10px; border-bottom: 1px solid #F1ECDD; font-variant-numeric: tabular-nums; }
  .psh-sheets { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 20px; margin: 18px 0 24px; }
  .psh-sheet { margin: 0; display: grid; gap: 8px; }
  .psh-sheet img { width: 100%; aspect-ratio: ${SHEET.w} / ${SHEET.h}; border: 1px solid #DED2AC; border-radius: 6px; background: #fff; }
  .psh-sheet figcaption { font-size: 13px; color: #6B6559; }
  .psh-sheet figcaption b { color: #15130F; }
  .psh-progress { font-size: 13px; color: #6B6559; margin: 0 0 14px; }
  .psh-warns { margin: 0 0 18px; padding-left: 18px; font-size: 13px; color: #6A4A0C; line-height: 1.55; }
  @media (max-width: 700px) { .psh { padding: 24px 16px 48px; } .psh-table { font-size: 12px; } }
`;

export default function PrintSheetsPage() {
  const [day, setDay] = useState(today);
  const [data, setData] = useState(null); // { day, packs, downloads } for the day shown
  const [error, setError] = useState("");
  const [made, setMade] = useState(null); // { day, layout, previews, info }
  const [busy, setBusy] = useState(""); // what is happening now
  const [saved, setSaved] = useState(""); // after a download

  useEffect(() => {
    let off = false;
    customizationService
      .getPrintDay(day)
      .then((d) => !off && setData(d))
      .catch((err) => !off && setError(err.response?.data?.message || "Couldn't load that day's orders."));
    return () => {
      off = true;
    };
  }, [day]);

  const loading = data?.day !== day && !error;
  const packs = data?.day === day ? data.packs : [];
  const tees = packs.reduce((n, p) => n + teesOf(p), 0);
  const sheetsNow = made?.day === day ? made : null;
  const last = data?.day === day ? data.downloads.at(-1) : null;

  const pickDay = (v) => {
    if (!v) return;
    setError("");
    setSaved("");
    setDay(v);
  };

  const lay = async () => {
    setError("");
    setSaved("");
    setBusy("Getting ready…");
    try {
      const info = await collectPieces(packs, (done, total, label) => setBusy(`${label} (${done} of ${total})`));
      const layout = layOut(info.pieces);
      const previews = layout.sheets.map((s) => drawSheet(s, 8, { preview: true }).toDataURL("image/png"));
      setMade({ day, layout, previews, info });
    } catch (err) {
      setError(err.message || "Couldn't lay out the sheets.");
    } finally {
      setBusy("");
    }
  };

  const download = async () => {
    if (!sheetsNow) return;
    setError("");
    setBusy("Getting ready…");
    try {
      const { layout, info } = sheetsNow;
      const { blob, fileName } = await buildSheetsZip(day, layout, info, (done, total, label) => setBusy(label));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      const pieces = layout.sheets.reduce((n, s) => n + s.items.length, 0);
      setSaved(`Downloaded ${fileName}.`);
      // remember it, so the page warns before this day is printed twice
      customizationService
        .markPrintDayDownloaded(day, { sheets: layout.sheets.length, orders: info.orders, pieces })
        .then((r) => setData((d) => (d?.day === day ? { ...d, downloads: r.downloads } : d)))
        .catch(() => {});
    } catch (err) {
      setError(err.message || "Couldn't make the sheets.");
    } finally {
      setBusy("");
    }
  };

  const count = sheetsNow ? sheetsNow.layout.sheets.reduce((n, s) => n + s.items.length, 0) : 0;

  return (
    <div className="psh">
      <style>{css}</style>
      <p className="psh-eyebrow">Admin · Orders</p>
      <h1>Print sheets</h1>
      <p className="psh-lead">
        Every custom-design order placed on a day, laid out on the print team’s {SHEET.w} × {SHEET.h} cm sheets: one print per tee,
        {` ${GAP}`} cm apart, turned sideways when that fits better. Each print has a small tag under it (order, size, tee colour, print
        area) to cut off after printing.
      </p>

      <div className="psh-bar">
        <label>
          Orders placed on
          <input type="date" value={day} max={today()} onChange={(e) => pickDay(e.target.value)} />
        </label>
        <button type="button" className="psh-btn" onClick={lay} disabled={loading || !!busy || !packs.length}>
          {sheetsNow ? "Lay out again" : "Lay out the sheets"}
        </button>
        {sheetsNow && sheetsNow.layout.sheets.length > 0 && (
          <button type="button" className="psh-btn gold" onClick={download} disabled={!!busy}>
            Download {plural(sheetsNow.layout.sheets.length, "sheet")} (ZIP)
          </button>
        )}
      </div>

      {last && (
        <p className="psh-note warn">
          This day’s sheets were downloaded on <b>{when(last.at)}</b>
          {last.byName ? ` by ${last.byName}` : ""} ({plural(last.sheets, "sheet")}, {plural(last.pieces, "print")}). Check with the print
          team before printing it again.
        </p>
      )}
      {error && <p className="psh-note bad" role="alert">{error}</p>}
      {saved && <p className="psh-note ok" role="status">{saved} Open SHEET-LIST.txt inside for what is on each sheet and where each print goes on the tee.</p>}
      {busy && <p className="psh-progress" role="status">{busy}</p>}

      {loading ? (
        <p className="psh-progress">Loading the day’s orders…</p>
      ) : !packs.length ? (
        !error && <p className="psh-progress">No custom-design orders were placed on this day.</p>
      ) : (
        <>
          <p className="psh-stats">
            <span><b>{packs.length}</b>{packs.length === 1 ? "order" : "orders"}</span>
            <span><b>{tees}</b>{tees === 1 ? "tee" : "tees"}</span>
            {sheetsNow && <span><b>{count}</b>{count === 1 ? "print" : "prints"}</span>}
            {sheetsNow && <span><b>{sheetsNow.layout.sheets.length}</b>{sheetsNow.layout.sheets.length === 1 ? "sheet" : "sheets"}</span>}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="psh-table">
              <thead>
                <tr><th>Order</th><th>Placed</th><th>Customer</th><th>Designs</th><th>Tees</th></tr>
              </thead>
              <tbody>
                {packs.map((p) => (
                  <tr key={p.order._id}>
                    <td><b>#{p.order.number}</b></td>
                    <td>{when(p.order.createdAt)}</td>
                    <td>{p.order.customer || "—"}</td>
                    <td>{p.designs.length}</td>
                    <td>{teesOf(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {sheetsNow && (
        <>
          {sheetsNow.layout.tooBig.length > 0 && (
            <p className="psh-note bad">Too big for a {SHEET.w} × {SHEET.h} cm sheet, so not on any sheet: {sheetsNow.layout.tooBig.map((p) => p.tag).join("; ")}.</p>
          )}
          {sheetsNow.info.warnings.length > 0 && (
            <ul className="psh-warns">
              {sheetsNow.info.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="psh-sheets">
            {sheetsNow.layout.sheets.map((s, i) => (
              <figure key={i} className="psh-sheet">
                <img src={sheetsNow.previews[i]} alt={`Sheet ${i + 1}: ${plural(s.items.length, "print")}`} />
                <figcaption>
                  <b>Sheet {i + 1}</b> · {plural(s.items.length, "print")} · {Math.round(s.used * 100)}% used
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import {
  getAllOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  activateOffer,
  reset,
} from "../../redux/slices/bannerSlice";
import { THEME, inputStyle, labelStyle } from "../../theme/theme";

export default function OfferBannerPage() {
  const dispatch = useDispatch();
  const { offers, isLoading, isError, message } = useSelector((s) => s.banner);
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    dispatch(getAllOffers());
    return () => dispatch(reset());
  }, [dispatch]);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newText.trim()) return;
    dispatch(createOffer(newText.trim()))
      .unwrap()
      .then(() => {
        toast.success("Offer added");
        setNewText("");
      })
      .catch((err) => toast.error(err || "Failed to add offer"));
  };

  const startEdit = (o) => {
    setEditingId(o._id);
    setEditText(o.offerText);
  };

  const saveEdit = (id) => {
    dispatch(updateOffer({ id, data: { offerText: editText } }))
      .unwrap()
      .then(() => {
        toast.success("Offer updated");
        setEditingId(null);
      })
      .catch((err) => toast.error(err || "Update failed"));
  };

  const handleDelete = (id) => {
    if (!window.confirm("Delete this offer?")) return;
    dispatch(deleteOffer(id))
      .unwrap()
      .then(() => toast.success("Offer deleted"))
      .catch((err) => toast.error(err || "Delete failed"));
  };

  const handleActivate = (id) => {
    dispatch(activateOffer(id))
      .unwrap()
      .then(() => toast.success("Offer is now live"))
      .catch((err) => toast.error(err || "Activate failed"));
  };

  return (
    <div style={{ minHeight: "100vh", background: THEME.bg, color: THEME.text, padding: "32px 40px", fontFamily: "'Inter', sans-serif" }}>
      <p style={{ ...labelStyle, margin: 0, color: THEME.gold }}>Admin · Content</p>
      <h1 style={{ margin: "4px 0 4px", fontSize: 26, fontWeight: 600, fontFamily: "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif" }}>
        Offer Banner
      </h1>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: THEME.textMuted }}>
        Controls the announcement strip shown at the top of every page. Only one offer can be live at a time.
      </p>

      <form onSubmit={handleAdd} style={{ display: "flex", gap: 10, marginBottom: 28 }}>
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="e.g. Get 10% Off on your First Purchase. Use Code - SAVE10"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="submit"
          style={{
            padding: "0 20px",
            borderRadius: 8,
            border: "none",
            background: `linear-gradient(135deg, ${THEME.gold}, ${THEME.goldBright})`,
            color: "#0B0B0C",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Add Offer
        </button>
      </form>

      {isLoading && <p style={{ color: THEME.textMuted }}>Loading…</p>}
      {isError && <p style={{ color: THEME.danger }}>{message}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {offers.map((o) => (
          <div
            key={o._id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              border: `1px solid ${o.isActive ? THEME.gold : THEME.border}`,
              borderRadius: 10,
              background: o.isActive ? THEME.goldBg : THEME.surface,
            }}
          >
            <input
              type="radio"
              checked={o.isActive}
              onChange={() => handleActivate(o._id)}
              title="Set as live"
              style={{ accentColor: THEME.gold, cursor: "pointer" }}
            />

            {editingId === o._id ? (
              <input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                autoFocus
              />
            ) : (
              <span style={{ flex: 1, fontSize: 14 }}>
                {o.offerText}
                {o.isActive && (
                  <>
                    <span style={{ marginLeft: 10, fontSize: 11, color: THEME.goldDeep, fontWeight: 700 }}>
                      ● LIVE
                    </span>
                    {/* no offer live at all, without deleting this one */}
                    <button
                      type="button"
                      onClick={() =>
                        dispatch(updateOffer({ id: o._id, data: { isActive: false } }))
                          .unwrap()
                          .then(() => toast.success("Offer turned off — no offer is live now"))
                          .catch((err) => toast.error(err || "Couldn't turn the offer off"))
                      }
                      style={{ marginLeft: 10, fontSize: 11, fontWeight: 700, border: `1px solid ${THEME.border}`, background: "none", borderRadius: 999, padding: "3px 10px", cursor: "pointer", color: THEME.textMuted }}
                    >
                      Turn off
                    </button>
                  </>
                )}
              </span>
            )}

            {editingId === o._id ? (
              <button
                onClick={() => saveEdit(o._id)}
                style={{ background: THEME.gold, border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontWeight: 700 }}
              >
                Save
              </button>
            ) : (
              <button
                onClick={() => startEdit(o)}
                style={{ background: "none", border: `1px solid ${THEME.border}`, borderRadius: 6, padding: "6px 14px", cursor: "pointer", color: THEME.text }}
              >
                Edit
              </button>
            )}

            <button
              onClick={() => handleDelete(o._id)}
              style={{
                background: THEME.dangerBg,
                border: `1px solid ${THEME.dangerBorder}`,
                color: THEME.danger,
                borderRadius: 6,
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        ))}

        {!isLoading && offers.length === 0 && (
          <p style={{ color: THEME.textMuted }}>No offers yet — add one above.</p>
        )}
      </div>
    </div>
  );
}
// The "Save and continue →" button at the bottom of each wizard step.
export default function SaveRow({ saving, onSave, disabled, label = "Save and continue →" }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
      <button type="button" className="aw-btn dark" disabled={saving || disabled} onClick={onSave}>
        {saving ? "Saving…" : label}
      </button>
    </div>
  );
}

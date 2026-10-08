import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { THEME, inputStyle, labelStyle } from "../../../theme/theme";
import {
  fetchSettings,
  saveSettings,
} from "../../../redux/slices/settingSlice";
import settingService from "../../../services/settingService";
import { fetchPublicSettings } from "../../../redux/slices/publicSettingsSlice";
import { imageUrl } from "../../../utils/imageUrl";


export default function GeneralSettingsPage() {
  const dispatch = useDispatch();
  const { user } = useSelector((s) => s.auth);
  const { byCategory, isLoading, isSaving } = useSelector((s) => s.settings);
  const settings = byCategory.general || [];

  const [form, setForm] = useState({});
  const [dirty, setDirty] = useState(false);
  const [uploadingKey, setUploadingKey] = useState(null);

  useEffect(() => {
    dispatch(fetchSettings("general"));
  }, [dispatch]);

  useEffect(() => {
    if (settings.length === 0) return;
    const map = {};
    settings.forEach((s) => {
      map[s.key] = s.value;
    });
    setForm(map);
    setDirty(false);
  }, [settings]);

  // Warn on tab close/navigate if there are unsaved changes.
  useEffect(() => {
    const handler = (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const handleImageUpload = async (key, file) => {
    if (!file) return;
    setUploadingKey(key);
    try {
      const { path } = await settingService.uploadSettingAsset(
        file,
        user.token,
      );
      set(key, path);
      toast.success("Image uploaded — remember to Save Changes");
    } catch (err) {
      toast.error(err.response?.data?.message || "Upload failed");
    } finally {
      setUploadingKey(null);
    }
  };

  const handleSave = async () => {
    try {
      const result = await dispatch(
        saveSettings({ category: "general", values: form }),
      ).unwrap();

      if (result.unknownKeys?.length > 0) {
        toast.warn(
          `Saved, but these fields aren't set up yet and were ignored: ${result.unknownKeys.join(", ")}`,
        );
      } else if (result.failedKeys?.length > 0) {
        toast.error(
          `Some fields failed to save: ${result.failedKeys.join(", ")}`,
        );
      } else {
        toast.success("General settings saved");
      }
      setDirty(false);

      // Storefront (Navbar/Home/Footer) caches public settings for the whole
      // tab session via `isLoaded`. Force a refresh now so contact info,
      // logo, socials etc. update immediately without a hard reload.
      dispatch(fetchPublicSettings());
    } catch (err) {
      toast.error(err || "Save failed");
    }
  };

  const handleReset = () => {
    const map = {};
    settings.forEach((s) => {
      map[s.key] = s.value;
    });
    setForm(map);
    setDirty(false);
  };

  if (isLoading && settings.length === 0) {
    return <p style={{ color: THEME.textMuted }}>Loading settings…</p>;
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: THEME.gold,
        }}
      >
        Settings
      </p>
      <h1
        style={{
          margin: "4px 0 4px",
          fontSize: 24,
          fontWeight: 600,
          fontFamily: "'Cormorant Garamond', serif",
        }}
      >
        General
      </h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: THEME.textMuted }}>
        Store identity, contact details, and social links shown across the
        storefront.
      </p>

      <SettingCard title="Store Identity">
        <TextField
          label="Store Name"
          value={form["general.storeName"] || ""}
          onChange={(v) => set("general.storeName", v)}
        />
        <TextField
          label="Store Description"
          textarea
          value={form["general.storeDescription"] || ""}
          onChange={(v) => set("general.storeDescription", v)}
        />
        <ImageField
          label="Store Logo"
          value={form["general.storeLogo"]}
          uploading={uploadingKey === "general.storeLogo"}
          onUpload={(file) => handleImageUpload("general.storeLogo", file)}
        />
        <ImageField
          label="Favicon"
          value={form["general.favicon"]}
          uploading={uploadingKey === "general.favicon"}
          onUpload={(file) => handleImageUpload("general.favicon", file)}
        />
      </SettingCard>

      <SettingCard title="Contact">
        <TextField
          label="Store Email"
          value={form["general.storeEmail"] || ""}
          onChange={(v) => set("general.storeEmail", v)}
        />
        <TextField
          label="Support Email"
          value={form["general.supportEmail"] || ""}
          onChange={(v) => set("general.supportEmail", v)}
        />
        <TextField
          label="Phone Number"
          value={form["general.phoneNumber"] || ""}
          onChange={(v) => set("general.phoneNumber", v)}
        />
        <TextField
          label="WhatsApp Number"
          value={form["general.whatsappNumber"] || ""}
          onChange={(v) => set("general.whatsappNumber", v)}
        />
        <TextField
          label="Business Address"
          textarea
          value={form["general.businessAddress"] || ""}
          onChange={(v) => set("general.businessAddress", v)}
        />
        <TextField
          label="GSTIN"
          value={form["general.gstin"] || ""}
          onChange={(v) => set("general.gstin", v)}
        />
      </SettingCard>

      <SettingCard title="Regional">
        <TextField
          label="Currency"
          value={form["general.currency"] || ""}
          onChange={(v) => set("general.currency", v)}
        />
        <TextField
          label="Timezone"
          value={form["general.timezone"] || ""}
          onChange={(v) => set("general.timezone", v)}
        />
        <TextField
          label="Website URL"
          value={form["general.websiteUrl"] || ""}
          onChange={(v) => set("general.websiteUrl", v)}
        />
      </SettingCard>

      <SettingCard title="Social Links">
        <TextField
          label="Instagram"
          value={form["general.instagramUrl"] || ""}
          onChange={(v) => set("general.instagramUrl", v)}
        />
        <TextField
          label="Facebook"
          value={form["general.facebookUrl"] || ""}
          onChange={(v) => set("general.facebookUrl", v)}
        />
        <TextField
          label="YouTube"
          value={form["general.youtubeUrl"] || ""}
          onChange={(v) => set("general.youtubeUrl", v)}
        />
      </SettingCard>

      <SettingCard
        title="Maintenance Mode"
        danger={!!form["general.maintenanceMode"]}
      >
        <ToggleField
          label="Enable Maintenance Mode"
          description="Blocks all customer-facing storefront traffic with a 503 response. Admins can still browse and turn this back off."
          checked={!!form["general.maintenanceMode"]}
          onChange={(v) => set("general.maintenanceMode", v)}
        />
      </SettingCard>

      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 24,
          position: "sticky",
          bottom: 0,
          background: THEME.bg,
          paddingTop: 12,
        }}
      >
        <button
          onClick={handleReset}
          disabled={!dirty || isSaving}
          style={{
            padding: "10px 22px",
            borderRadius: 8,
            border: `1px solid ${THEME.border}`,
            background: THEME.surface,
            color: THEME.textMuted,
            cursor: dirty ? "pointer" : "not-allowed",
            fontSize: 13,
          }}
        >
          Reset
        </button>
        <button
          onClick={handleSave}
          disabled={!dirty || isSaving}
          style={{
            padding: "10px 28px",
            borderRadius: 8,
            border: "none",
            background: dirty
              ? `linear-gradient(135deg, ${THEME.gold}, ${THEME.goldBright})`
              : THEME.border,
            color: dirty ? "#0B0B0C" : THEME.textMuted,
            fontWeight: 700,
            fontSize: 13,
            cursor: dirty && !isSaving ? "pointer" : "not-allowed",
          }}
        >
          {isSaving ? "Saving…" : "Save Changes"}
        </button>
        {dirty && (
          <span
            style={{ alignSelf: "center", fontSize: 12, color: THEME.gold }}
          >
            You have unsaved changes
          </span>
        )}
      </div>
    </div>
  );
}

function SettingCard({ title, children, danger }) {
  return (
    <div
      style={{
        border: `1px solid ${danger ? THEME.dangerBorder : THEME.border}`,
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
        background: THEME.surface,
      }}
    >
      <p
        style={{
          margin: "0 0 14px",
          fontSize: 13,
          fontWeight: 700,
          color: THEME.text,
        }}
      >
        {title}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, textarea }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          style={{ ...inputStyle, marginTop: 5, resize: "vertical" }}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, marginTop: 5 }}
        />
      )}
    </div>
  );
}

function ImageField({ label, value, uploading, onUpload }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}
      >
        {value && (
          <img
            src={imageUrl(value)}
            alt=""
            style={{
              width: 48,
              height: 48,
              objectFit: "contain",
              borderRadius: 6,
              border: `1px solid ${THEME.border}`,
              background: "#fff",
            }}
          />
        )}
        <label
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: `1px solid ${THEME.border}`,
            fontSize: 12,
            cursor: uploading ? "wait" : "pointer",
            color: THEME.textMuted,
          }}
        >
          {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            disabled={uploading}
            onChange={(e) => onUpload(e.target.files?.[0])}
          />
        </label>
      </div>
    </div>
  );
}

function ToggleField({ label, description, checked, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 42,
          height: 24,
          borderRadius: 999,
          border: "none",
          background: checked ? THEME.danger : THEME.border,
          position: "relative",
          cursor: "pointer",
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 21 : 3,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            transition: "left 0.15s ease",
          }}
        />
      </button>
      <div>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            color: THEME.text,
          }}
        >
          {label}
        </p>
        {description && (
          <p
            style={{ margin: "2px 0 0", fontSize: 11, color: THEME.textMuted }}
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { THEME, getInputStyle, getLabelStyle } from "../../../theme/theme";
import { updateProfile } from "../../../redux/slices/authSlice";
import profileService from "../../../services/profileService";
import { imageUrl } from "../../../utils/imageUrl";


export default function ProfileSettingsPage() {
  const dispatch = useDispatch();
  const { user } = useSelector((s) => s.auth);
  const theme = THEME;
  const inputStyle = getInputStyle(theme);
  const labelStyle = getLabelStyle(theme);

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  useEffect(() => {
    if (!user?.token) return;
    profileService
      .getProfile(user.token)
      .then((data) =>
        setForm({
          name: data.name || "",
          lastName: data.lastName || "",
          email: data.email || "",
          gender: data.gender || "Male",
          dateOfBirth: data.dateOfBirth ? data.dateOfBirth.slice(0, 10) : "",
          profilePicture: data.profilePicture || "",
        }),
      )
      .catch(() => toast.error("Could not load profile"));
  }, [user?.token]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handlePhotoChange = (file) => {
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("lastName", form.lastName);
      fd.append("email", form.email);
      fd.append("gender", form.gender);
      if (form.dateOfBirth) fd.append("dateOfBirth", form.dateOfBirth);
      if (photoFile) fd.append("profilePicture", photoFile);

      const updated = await dispatch(updateProfile(fd)).unwrap();

      toast.success("Profile updated");
      setPhotoFile(null);

      setForm((f) => ({
        ...f,
        profilePicture: updated.profilePicture || f.profilePicture,
        profilePictureUpdatedAt: Date.now(),
      }));
    } catch (err) {
      toast.error(err || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <p style={{ color: theme.textMuted }}>Loading profile…</p>;

  const currentPhoto =
    photoPreview ||
    (form.profilePicture
      ? `${imageUrl(form.profilePicture)}?v=${form.profilePictureUpdatedAt || Date.now()}`
      : "");

  return (
    <div style={{ maxWidth: 560 }}>
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: theme.gold,
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
          color: theme.text,
        }}
      >
        Profile
      </h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: theme.textMuted }}>
        Your admin account details.
      </p>

      <div
        style={{
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          padding: 20,
          background: theme.surface,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {currentPhoto ? (
            <img
              src={currentPhoto}
              alt=""
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                objectFit: "cover",
                border: `1px solid ${theme.border}`,
              }}
            />
          ) : (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: theme.goldBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                fontWeight: 700,
                color: theme.goldBright,
              }}
            >
              {form.name?.[0]?.toUpperCase() || "A"}
            </div>
          )}
          <label
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              fontSize: 12,
              cursor: "pointer",
              color: theme.textMuted,
            }}
          >
            Change photo
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => handlePhotoChange(e.target.files?.[0])}
            />
          </label>
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
        >
          <div>
            <label style={labelStyle}>First Name</label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              style={{ ...inputStyle, marginTop: 5 }}
            />
          </div>
          <div>
            <label style={labelStyle}>Last Name</label>
            <input
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              style={{ ...inputStyle, marginTop: 5 }}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Email</label>
          <input
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            style={{ ...inputStyle, marginTop: 5 }}
          />
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
        >
          <div>
            <label style={labelStyle}>Gender</label>
            <select
              value={form.gender}
              onChange={(e) => set("gender", e.target.value)}
              style={{ ...inputStyle, marginTop: 5 }}
            >
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date of Birth</label>
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => set("dateOfBirth", e.target.value)}
              style={{ ...inputStyle, marginTop: 5 }}
            />
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: 20,
          padding: "10px 28px",
          borderRadius: 8,
          border: "none",
          background: `linear-gradient(135deg, ${theme.gold}, ${theme.goldBright})`,
          color: theme.ink,
          fontWeight: 700,
          fontSize: 13,
          cursor: saving ? "not-allowed" : "pointer",
        }}
      >
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}

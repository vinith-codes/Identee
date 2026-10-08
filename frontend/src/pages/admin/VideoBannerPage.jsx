import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import {
  getVideoBanner,
  addVideoBanner,
  deleteVideoBanner,
  reset,
} from "../../redux/slices/bannerSlice";
import { THEME, getInputStyle, getLabelStyle } from "../../theme/theme";
import { imageUrl } from "../../utils/imageUrl";


const SECTIONS = [
  {
    key: "hero",
    title: "Hero Video",
    desc: "Full-screen video at the top of the Home page.",
  },
  {
    key: "styleOutlookMain",
    title: "Style Outlook — Main Video",
    desc: "Big left video in the black 'Style Outlook' section.",
  },
  {
    key: "styleOutlookSide1",
    title: "Style Outlook — Side Video 1",
    desc: "Top-right (taller) video in the 'Style Outlook' section.",
  },
  {
    key: "styleOutlookSide2",
    title: "Style Outlook — Side Video 2",
    desc: "Bottom-right (shorter) video in the 'Style Outlook' section.",
  },
  {
    key: "designYourOwn",
    title: "Design Your Own Video",
    desc: "Video in the yellow 'Design Your Own' section.",
  },
];

function SectionVideoCard({
  section,
  title,
  desc,
  existing,
  isLoading,
  theme,
  inputStyle,
  labelStyle,
}) {
  const dispatch = useDispatch();
  const [file, setFile] = useState(null);

  const handleUpload = (e) => {
    e.preventDefault();
    if (!file) return toast.error("Choose a video file first");

    const formData = new FormData();
    formData.append("section", section);
    formData.append("video", file);

    dispatch(addVideoBanner(formData))
      .unwrap()
      .then(() => {
        toast.success(`${title} saved`);
        setFile(null);
      })
      .catch((err) => {
        console.error("Upload failed:", err);
        toast.error(err || "Upload failed — check console for details");
      });
  };

  const handleDelete = () => {
    if (!existing?._id) return;
    if (!window.confirm(`Remove the ${title}?`)) return;
    dispatch(deleteVideoBanner(existing._id))
      .unwrap()
      .then(() => toast.success(`${title} removed`))
      .catch((err) => toast.error(err || "Delete failed"));
  };

  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 14,
        padding: 22,
        marginBottom: 22,
      }}
    >
      <h3
        style={{
          margin: "0 0 4px",
          fontSize: 17,
          fontWeight: 600,
          color: theme.text,
        }}
      >
        {title}
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: theme.textMuted }}>
        {desc}
      </p>

      {existing ? (
        <div>
          <video
            src={imageUrl(existing.videoUrl)}
            controls
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 10,
              border: `1px solid ${theme.border}`,
            }}
          />
          <div>
            <button
              onClick={handleDelete}
              style={{
                marginTop: 12,
                background: theme.dangerBg,
                border: `1px solid ${theme.dangerBorder}`,
                color: theme.danger,
                borderRadius: 8,
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Remove Video
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleUpload}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            maxWidth: 420,
          }}
        >
          <div>
            <label style={labelStyle}>Video File *</label>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ ...inputStyle, marginTop: 5, padding: 8 }}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              border: "none",
              background: isLoading
                ? "#8A6F2E"
                : `linear-gradient(135deg, ${theme.gold}, ${theme.goldBright})`,
              color: theme.ink,
              fontWeight: 700,
              cursor: isLoading ? "not-allowed" : "pointer",
              alignSelf: "flex-start",
            }}
          >
            {isLoading ? "Uploading…" : "Upload Video"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function VideoBannerPage() {
  const dispatch = useDispatch();
  const { videoBanners, isLoading, isError, isSuccess, message } = useSelector(
    (s) => s.banner,
  );
  const theme = THEME;
  const inputStyle = getInputStyle(theme);
  const labelStyle = getLabelStyle(theme);

  useEffect(() => {
    dispatch(getVideoBanner());
  }, [dispatch]);

  useEffect(() => {
    if (isSuccess) {
      toast.success("Video banner saved");
      dispatch(reset());
      dispatch(getVideoBanner());
    }
    if (isError) {
      toast.error(message || "Something went wrong");
      dispatch(reset());
    }
  }, [isSuccess, isError, message, dispatch]);

  const findBySection = (key) =>
    (videoBanners || []).find((v) => v.section === key) || null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.bg,
        color: theme.text,
        padding: "32px 40px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <p style={{ ...labelStyle, margin: 0, color: theme.gold }}>
        Admin · Content
      </p>
      <h1
        style={{
          margin: "4px 0 4px",
          fontSize: 26,
          fontWeight: 600,
          fontFamily: "'Cormorant Garamond', serif",
        }}
      >
        Home Page Videos
      </h1>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: theme.textMuted }}>
        Controls the 3 videos on the Home page — Hero, Style Outlook, and Design
        Your Own. Each section holds one video; upload a new one after removing
        the current one.
      </p>

      <div style={{ maxWidth: 480 }}>
        {SECTIONS.map((s) => (
          <SectionVideoCard
            key={s.key}
            section={s.key}
            title={s.title}
            desc={s.desc}
            existing={findBySection(s.key)}
            isLoading={isLoading}
            theme={theme}
            inputStyle={inputStyle}
            labelStyle={labelStyle}
          />
        ))}
      </div>
    </div>
  );
}

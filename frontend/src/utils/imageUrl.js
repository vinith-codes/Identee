const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Turns a stored image path into a displayable URL.
// - Cloudinary URLs (older pictures) get on-the-fly resizing + auto format/quality.
// - "/uploads/..." paths are pictures on our own server (since 6 Nov 2026): the backend sends a small WebP copy when a
//   width is asked for (?w=600), the file itself otherwise.
export const imageUrl = (url, width) => {
  if (!url) return "";
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    const t = ["f_auto", "q_auto", width ? `w_${width}` : null, "c_limit"]
      .filter(Boolean)
      .join(",");
    return url.replace("/upload/", `/upload/${t}/`);
  }
  if (/^https?:\/\//.test(url)) return url;
  const own = `${BACKEND_URL}${url.startsWith("/") ? "" : "/"}${url}`;
  return width && /^\/?uploads\//.test(url) && !/\.(mp4|webm|mov|pdf|gif)$/i.test(url) ? `${own}?w=${Math.round(width)}` : own;
};

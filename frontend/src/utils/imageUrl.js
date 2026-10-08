const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Turns a stored image path into a displayable URL.
// - Cloudinary URLs get on-the-fly resizing + auto format/quality
//   (a 5 MB upload is served as a small WebP sized for the screen).
// - Local "/uploads/..." paths (dev fallback) are prefixed with the API host.
export const imageUrl = (url, width) => {
  if (!url) return "";
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    const t = ["f_auto", "q_auto", width ? `w_${width}` : null, "c_limit"]
      .filter(Boolean)
      .join(",");
    return url.replace("/upload/", `/upload/${t}/`);
  }
  if (/^https?:\/\//.test(url)) return url;
  return `${BACKEND_URL}${url.startsWith("/") ? "" : "/"}${url}`;
};

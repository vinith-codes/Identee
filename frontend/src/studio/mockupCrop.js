// studio/mockupCrop.js
// A 4:5 picture of the tee from a full 3D-view snapshot (for mockups). Used by the design room's Review and by the
// admin's Collection maker (25 Oct 2026: moved out of DesignRoomPage.jsx so both can use it).
export function cropMockup(dataUrl, outW = 640, outH = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const h = img.height * 0.96;
      const w = h * (outW / outH);
      const c = document.createElement("canvas");
      c.width = outW;
      c.height = outH;
      c.getContext("2d").drawImage(img, (img.width - w) / 2, (img.height - h) / 2, w, h, 0, 0, outW, outH);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

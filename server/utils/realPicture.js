// utils/realPicture.js — is this upload really a picture? (12 Nov 2026)
//
// The upload filter only reads the file's label (its "type"), and a damaged file or any file renamed to .jpg carries a
// picture's label too. Here the file is opened: a real picture has a width and a height.
import sharp from "sharp";

export const DAMAGED_PICTURE = "This picture file is damaged and can’t be opened. Please choose another one.";

export async function isRealPicture(buffer) {
  if (!buffer?.length) return false;
  try {
    const { width, height } = await sharp(buffer).metadata();
    return width > 0 && height > 0;
  } catch {
    return false;
  }
}

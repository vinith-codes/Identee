# Tidies a small cut-out photo before build_regular.py (used for the kids tee, ~250 px tall):
# pulls the edge in 2 px (drops the grey background rim), softens speckle, upscales 3x.
#   python clean_small_photo.py <cutout_front_back.png> <out.png>
import sys
from PIL import Image, ImageFilter
im = Image.open(sys.argv[1]).convert("RGBA")
r, g, b, a = im.split()
rgb = Image.merge("RGB", (r, g, b)).filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
a = a.point(lambda v: 255 if v >= 128 else 0).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(0.8))
out = Image.merge("RGBA", (*rgb.split(), a))
out = out.resize((out.width * 3, out.height * 3), Image.LANCZOS)
out.save(sys.argv[2])

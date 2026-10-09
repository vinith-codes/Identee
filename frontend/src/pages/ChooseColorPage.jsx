import { useNavigate, useParams, Link } from "react-router-dom";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchGarmentTypes } from "../redux/slices/garmentTypeSlice";
import { fetchAllGarmentImages } from "../redux/slices/garmentImageSlice";
import GarmentVisual from "../components/GarmentVisual";

const C = {
  bg: "#FFFFFF",
  title: "#2B2560",
  ink: "#1A1A1A",
  muted: "#8C8C8C",
  black: "#0E0E0E",
};

export default function ChooseColorPage() {
  const { type } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { items: garmentTypes } = useSelector((s) => s.garmentType);
  const { items: garmentImages, isLoading } = useSelector(
    (s) => s.garmentImage,
  );

  useEffect(() => {
    dispatch(fetchGarmentTypes());
    dispatch(fetchAllGarmentImages());
  }, [dispatch]);

  const garment = garmentTypes.find((g) => g.key === type);

  // every uploaded color-photo-set for this garment = the available colors
  const colors = garmentImages
    .filter((d) => d.garmentType === type)
    .map((d) => ({ slug: d.colorSlug, name: d.colorName, hex: d.colorHex }));

  if (!isLoading && !garment) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: C.muted }}>
        We couldn't find that product.{" "}
        <Link to="/customizable" style={{ color: C.title }}>
          Choose a product
        </Link>
      </div>
    );
  }

  if (!garment) return null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        padding: "48px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative" }}>
        <button
          onClick={() => navigate("/customizable")}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            padding: "14px 30px",
            borderRadius: 999,
            background: C.black,
            color: "#fff",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.06em",
            cursor: "pointer",
          }}
        >
          CHANGE PRODUCT
        </button>

        <h1
          style={{
            fontSize: 34,
            fontWeight: 800,
            color: C.title,
            textAlign: "center",
            margin: "0 0 48px",
          }}
        >
          CHOOSE COLOR
        </h1>

        {colors.length === 0 && (
          <p style={{ textAlign: "center", color: C.muted }}>
            No colors uploaded for this product yet.
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            columnGap: 24,
            rowGap: 40,
          }}
        >
          {colors.map((color) => (
            <button
              key={color.slug}
              onClick={() =>
                navigate(`/customize/${garment.key}?color=${color.slug}`)
              }
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                padding: 0,
                border: "none",
                background: "none",
                cursor: "pointer",
                transition: "transform 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1/1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ width: "78%", height: "78%" }}>
                  <GarmentVisual
                    garmentKey={garment.key}
                    colorSlug={color.slug}
                    view="front"
                  />
                </div>
              </div>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 400,
                  color: C.ink,
                  textTransform: "lowercase",
                }}
              >
                {color.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

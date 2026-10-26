// components/shop/ReadyDesignGrid.jsx — Shop your IDENTEE: the IDENTEE designs (made with the Collection maker and
// published by the admin, 25 Oct 2026). Nothing is shown while there are none.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import readyDesignService from "../../services/readyDesignService";
import PriceTag from "../PriceTag";
import { imageUrl } from "../../utils/imageUrl";
import "../../pages/readyDesign.css";

// category: only the tees listed under that category (a category's own page); otherwise all of them
export default function ReadyDesignGrid({ category = "" }) {
  const [designs, setDesigns] = useState([]);
  useEffect(() => {
    let alive = true;
    readyDesignService
      .list(category)
      .then((d) => alive && setDesigns(d.designs || []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [category]);
  if (!designs.length) return null;
  return (
    <section className="rd-section" aria-labelledby="rd-title">
      <h2 id="rd-title">IDENTEE designs</h2>
      <p>Our own designs, printed for you after you order.</p>
      <div className="rd-grid">
        {designs.map((d) => (
          <Link key={d._id} to={`/ready-made/design/${d.slug}`} className="rd-card">
            <div className="rd-card-pic">
              {/* the side with the picture first; the other side on hover */}
              <img src={imageUrl(d.mockups?.[d.hero] || d.mockups?.front, 700)} alt={d.name} loading="lazy" />
              {/* on hover: a person wearing it when there is a photo, else the other side */}
              {(d.photo || (d.mockups?.back && d.mockups?.front)) && <img src={imageUrl(d.photo || d.mockups[d.hero === "back" ? "front" : "back"], 700)} alt="" loading="lazy" />}
            </div>
            <div className="rd-card-body">
              <span className="rd-card-name">{d.name}</span>
              <span className="rd-card-sub">
                <span className="rd-dot" style={{ background: d.colourHex }} />
                {d.garmentLabel} · {d.colourName}
                {d.colours?.length > 1 ? ` · ${d.colours.length} colours` : ""}
              </span>
              <PriceTag price={d.price} was={d.comparePrice} size={14} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

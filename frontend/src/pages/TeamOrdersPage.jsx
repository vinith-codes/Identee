// pages/TeamOrdersPage.jsx  —  /team-orders
//
// "Create your team/group IDENTEE": one design for a whole team or group, with each person's own name, number
// and size. Pick a garment → the design room opens with the Team jersey layout and the assistant asks for the
// player list (DesignRoomPage ?team=1). In Review every player gets their own tee; the print files make one
// print per player. A big or special order can go to the shop directly (WhatsApp / phone from Admin → Settings).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import TeamLayoutPicker from "../components/TeamLayoutPicker";
import { fetchGarmentTypes } from "../redux/slices/garmentTypeSlice";
import { fetchAllGarmentImages } from "../redux/slices/garmentImageSlice";
import { fetchPublicSettings } from "../redux/slices/publicSettingsSlice";
import CustomizableGarments from "../components/CustomizableGarments";
import ShopPageHeader from "../components/ShopPageHeader";
import { isSellable } from "../utils/garments";
import { useShippingRule } from "../utils/sitePricing";
import { SHOPS } from "../utils/shopNames";

const CSS = `
  .tm-steps { list-style: none; margin: 0 0 40px; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
  .tm-step { border: 1px solid #EAE3CF; border-radius: 18px; padding: 22px 22px 24px; background: #FBF7EE; display: grid; gap: 8px; align-content: start; }
  .tm-step b { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: #15130F; color: #F0D585; font: 800 15px/1 Inter, sans-serif; }
  .tm-step h2 { margin: 6px 0 0; font: 800 19px/1.2 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; color: #15130F; }
  .tm-step p { margin: 0; color: #5E584D; font-size: 14px; line-height: 1.55; }
  .tm-step code { font: 600 13px/1.5 ui-monospace, Consolas, monospace; background: #fff; border: 1px solid #EAE3CF; border-radius: 6px; padding: 1px 6px; color: #15130F; }
  .tm-head { margin: 0 0 6px; font: 800 clamp(22px, 2.6vw, 28px)/1.15 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; color: #15130F; }
  .tm-sub { margin: 0 0 20px; color: #6B6559; font-size: 15px; }
  .tm-good { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 34px; padding: 0; list-style: none; }
  .tm-good li { border: 1px solid #E2D6B3; background: #fff; border-radius: 999px; padding: 7px 14px; font-size: 13px; font-weight: 600; color: #4A4130; }
  .tm-talk { margin-top: 44px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px 24px; padding: 24px 26px; border-radius: 20px; background: #15130F; color: #fff; }
  .tm-talk h2 { margin: 0 0 4px; font: 800 22px/1.2 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; }
  .tm-talk p { margin: 0; color: #CFC8B9; font-size: 14px; line-height: 1.55; max-width: 560px; }
  .tm-ways { display: flex; flex-wrap: wrap; gap: 10px; }
  .tm-ways a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: 999px; font-weight: 700; font-size: 14px; text-decoration: none; }
  .tm-ways a.wa { background: #C9A24B; color: #15130F; }
  .tm-ways a.call { border: 1.5px solid #CFC8B9; color: #fff; }
  @media (max-width: 860px) { .tm-steps { grid-template-columns: minmax(0, 1fr); } }
`;

export default function TeamOrdersPage() {
  const dispatch = useDispatch();
  const { items: garments, isLoading } = useSelector((s) => s.garmentType);
  const { items: images, isLoading: imagesLoading } = useSelector((s) => s.garmentImage);
  const { values: settings = {}, isLoaded } = useSelector((s) => s.publicSettings);
  const ship = useShippingRule();
  const navigate = useNavigate();
  const [picking, setPicking] = useState(null); // { garment, colour } — the layout picker is open for this tee

  useEffect(() => {
    dispatch(fetchGarmentTypes());
    dispatch(fetchAllGarmentImages());
    if (!isLoaded) dispatch(fetchPublicSettings());
  }, [dispatch, isLoaded]);

  const sellable = garments.filter((g) => isSellable(g, images));
  const loading = (isLoading || imagesLoading) && !sellable.length;
  const digits = (n) => String(n || "").replace(/\D/g, "");
  const wa = digits(settings["general.whatsappNumber"]);
  const phone = settings["general.phoneNumber"];

  return (
    <div style={{ background: "#FFFFFF", minHeight: "70vh" }}>
      <style>{CSS}</style>
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 64px" }}>
        <ShopPageHeader
          eyebrow="Teams & groups"
          title={SHOPS.team.name}
          text="One design for everyone, with each person’s own name, number and size. Every tee is checked one by one before you order."
          switchTo={{ to: SHOPS.create.to, label: "Just one tee? Create your IDENTEE →" }}
        />

        <ol className="tm-steps">
          <li className="tm-step">
            <b>1</b>
            <h2>Pick your tee and layout</h2>
            <p>Choose the garment below, then a layout: team jersey, name &amp; number, office, event — or create your own. Then the colour and your size.</p>
          </li>
          <li className="tm-step">
            <b>2</b>
            <h2>Make it your team’s</h2>
            <p>Change the words, fonts and colours, add your logo or a picture, on the front, back or sleeves.</p>
          </li>
          <li className="tm-step">
            <b>3</b>
            <h2>Add everyone</h2>
            <p>
              Type or paste your list: name, number and size, like <code>Arun 7 L, Karthik 10 XL</code>. Each person gets their own tee; see
              every one in Review.
            </p>
          </li>
        </ol>

        <ul className="tm-good" aria-label="Good for">
          {["Sports teams", "College & school groups", "Office & company", "Events & clubs", "Family trips", "Friends & birthday squads"].map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>

        <h2 className="tm-head">Pick your tee</h2>
        <p className="tm-sub">
          Same price per tee as a single order{ship?.freeFrom ? `, and free shipping from ${ship.freeFrom} pieces` : ""}.
        </p>
        <CustomizableGarments garments={sellable} images={images} loading={loading} team onStart={(garment, colour) => setPicking({ garment, colour })} />
        {picking && (
          <TeamLayoutPicker
            garment={picking.garment}
            onClose={() => setPicking(null)}
            onChoose={(layout) => navigate(`/customize/${picking.garment.key}?new=1${picking.colour ? `&color=${picking.colour.slug}` : ""}&team=${layout}`)}
          />
        )}

        {(wa || phone) && (
          <section className="tm-talk" aria-label="Talk to us about a big order">
            <div>
              <h2>A big order or a special request?</h2>
              <p>Matching shorts, a logo to clean up, a deadline for an event? Message us and we’ll help you plan it.</p>
            </div>
            <div className="tm-ways">
              {wa && (
                <a className="wa" href={`https://wa.me/${wa.length === 10 ? `91${wa}` : wa}`} target="_blank" rel="noreferrer">
                  WhatsApp {settings["general.whatsappNumber"]}
                </a>
              )}
              {phone && (
                <a className="call" href={`tel:+${digits(phone).length === 10 ? `91${digits(phone)}` : digits(phone)}`}>
                  Call {phone}
                </a>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

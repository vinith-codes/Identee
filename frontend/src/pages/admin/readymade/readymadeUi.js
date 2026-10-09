// Shared look for Admin → Ready-made (product list + wizard), on top of
// the garment wizard's AW styles.
export { colourHex } from "../../../utils/colours";

export const RM_CSS = `
  .rm-problems { background: #FFF4EF; border: 1px solid #F0C9B8; color: #8A2E12; border-radius: 12px; padding: 10px 14px;
    font-size: 13px; margin: 0; list-style: none; }
  ul.rm-problems li + li { margin-top: 4px; }
  ul.rm-problems li::before { content: "• "; }
  .rm-check { display: flex; gap: 10px; align-items: flex-start; font-size: 13.5px; cursor: pointer; }
  .rm-check input { width: 18px; height: 18px; margin-top: 1px; accent-color: #141110; }
  .rm-empty { color: #6B6355; font-size: 13.5px; background: #FBF8F1; border: 1px dashed #D7CCB3; border-radius: 12px; padding: 14px; margin: 0; }
  .rm-textbtn { background: none; border: none; padding: 4px 0; font: 700 13px 'Inter', sans-serif; color: #7A5B12; cursor: pointer; text-decoration: underline; }
  .rm-textbtn.danger { color: #A3341F; }
  .rm-confirm { font-size: 12.5px; color: #3F392F; display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .rm-confirm .aw-btn { min-height: 34px; padding: 6px 12px; font-size: 12.5px; }
  .rm-colourchip { display: inline-flex; align-items: center; gap: 8px; }
  .rm-colourchip:disabled { opacity: .4; cursor: default; }
  .rm-photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin-top: 14px;
    padding: 10px; border-radius: 12px; border: 1.5px dashed transparent; }
  .rm-photos.drag { border-color: #C9A24B; background: #FFFBF1; }
  .rm-photo { margin: 0; position: relative; border-radius: 10px; overflow: hidden; background: #F3EEE2; aspect-ratio: 4 / 5; }
  .rm-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .rm-main { position: absolute; top: 6px; left: 6px; background: #141110; color: #fff; font-size: 10.5px; font-weight: 800;
    padding: 3px 7px; border-radius: 999px; }
  .rm-photo figcaption { position: absolute; inset: auto 0 0 0; display: flex; justify-content: center; gap: 4px; padding: 6px;
    background: linear-gradient(transparent, rgba(20,17,16,.55)); }
  .rm-photo figcaption button { width: 30px; height: 30px; border-radius: 50%; border: none; background: #fff; font-weight: 800;
    cursor: pointer; color: #141110; }
  .rm-photo figcaption button:disabled { opacity: .35; cursor: default; }
  .rm-photo figcaption button.x { color: #A3341F; }
  .rm-addphoto { aspect-ratio: 4 / 5; border-radius: 10px; border: 1.5px dashed #CDBF9F; background: #FBF8F1; cursor: pointer;
    display: grid; place-content: center; gap: 4px; font: 600 12px 'Inter', sans-serif; color: #6B5A36; text-align: center; }
  .rm-addphoto:hover { border-color: #C9A24B; }
  .rm-addphoto b { font-size: 13.5px; color: #141110; }
  .rm-prices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
  .rm-money { display: flex; align-items: center; gap: 6px; font-weight: 800; }
  .rm-preview { background: #FBF8F1; border-radius: 12px; padding: 12px 14px; font-size: 16px; }
  .rm-off { color: #2E7D4F; font-weight: 800; font-size: 13px; }
  .rm-stock td, .rm-stock th { white-space: nowrap; }
  .rm-details { border: 1px solid #E7DFCC; border-radius: 12px; padding: 12px 14px; }
  .rm-details summary { cursor: pointer; font-weight: 700; font-size: 13.5px; }
  .rm-review { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 22px; align-items: start; }
  .rm-shopcard { border: 1px solid #E7DFCC; border-radius: 14px; padding: 10px; background: #fff; }
  .rm-shopimg { aspect-ratio: 4 / 5; border-radius: 10px; overflow: hidden; background: #F3EEE2; display: grid; place-items: center;
    color: #8A8172; font-size: 13px; }
  .rm-shopimg img { width: 100%; height: 100%; object-fit: cover; }
  .rm-swatch { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(0,0,0,.2); cursor: pointer; padding: 0; }
  .rm-swatch.on { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #141110; }
  .rm-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 16px; margin: 0; font-size: 13.5px; }
  .rm-facts dt { color: #6B6355; font-weight: 700; }
  .rm-facts dd { margin: 0; }
  @media (max-width: 760px) {
    .rm-prices, .rm-review { grid-template-columns: minmax(0, 1fr); }
  }
`;

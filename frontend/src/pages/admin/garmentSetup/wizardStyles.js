// Shared look for the Customizable pages and the garment set-up wizard
// (matches the admin prototype: cream page, white cards, ink + gold).

export const AW = {
  page: { maxWidth: 1180, margin: "0 auto", fontFamily: "'Inter', sans-serif", color: "#141110" },
  h1: { margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" },
  h2: { margin: 0, fontSize: 19, fontWeight: 800 },
  lead: { margin: "6px 0 0", color: "#6B6559", fontSize: 14.5, lineHeight: 1.5 },
  css: `
    .aw-card { background: #fff; border: 1px solid #E7DFCC; border-radius: 16px; }
    .aw-garment { color: #141110; text-decoration: none; display: block; transition: border-color .12s, box-shadow .12s; }
    .aw-garment:hover { border-color: #C9A24B; box-shadow: 0 6px 20px rgba(20,17,16,.07); }
    .aw-lbl { display: block; font-size: 12px; font-weight: 800; color: #3F392F; margin-bottom: 6px; letter-spacing: .02em; }
    .aw-help { font-size: 12.5px; color: #6B6355; margin: 6px 0 0; line-height: 1.5; }
    .aw-help a, .aw-link { color: #7A5B12; font-weight: 700; font-size: 13px; }
    .aw-inp { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #D7CCB3; border-radius: 10px;
      font: 500 14px 'Inter', sans-serif; color: #141110; background: #fff; min-height: 44px; }
    .aw-inp:focus { outline: 2px solid #C9A24B; outline-offset: 1px; }
    .aw-inp.small { min-height: 36px; padding: 6px 8px; width: 70px; }
    .aw-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 18px;
      border-radius: 11px; font: 700 14px 'Inter', sans-serif; min-height: 44px; box-sizing: border-box;
      cursor: pointer; border: 1px solid transparent; text-decoration: none; }
    .aw-btn:disabled { opacity: .5; cursor: not-allowed; }
    .aw-btn.dark { background: #141110; color: #fff; } .aw-btn.dark:hover:not(:disabled) { background: #2C261F; }
    .aw-btn.light { background: #fff; color: #141110; border-color: #D7CCB3; } .aw-btn.light:hover:not(:disabled) { border-color: #C9A24B; }
    .aw-btn.gold { background: #C9A24B; color: #141110; } .aw-btn.gold:hover:not(:disabled) { background: #B88F36; }
    .aw-chip { border: 1px solid #D7CCB3; background: #fff; border-radius: 999px; padding: 8px 16px;
      font: 700 13px 'Inter', sans-serif; color: #141110; cursor: pointer; min-height: 40px; }
    .aw-chip.on { background: #141110; color: #fff; border-color: #141110; }
    .aw-tag { font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 999px; letter-spacing: .03em; }
    .aw-tag.live { background: #E3F2E8; color: #24522F; } .aw-tag.draft { background: #F3EEE2; color: #6B5A36; }
    .aw-step { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px;
      border: 1px solid transparent; background: transparent; cursor: pointer; font: 700 13px 'Inter', sans-serif;
      color: #5C5547; text-align: left; min-height: 44px; width: 100%; }
    .aw-step:hover { background: #FFFBF1; }
    .aw-step.on { background: #fff; border-color: #E7DFCC; color: #141110; }
    .aw-mark { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 12px;
      font-weight: 800; flex-shrink: 0; background: #F0EADB; color: #141110; }
    .aw-mark.done { background: #E3F2E8; color: #2E7D4F; }
    .aw-sw { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 12px;
      border: 1px solid #E7DFCC; background: #fff; cursor: pointer; font: 600 13px 'Inter', sans-serif;
      color: #141110; min-height: 44px; text-align: left; }
    .aw-sw.on { border-color: #141110; box-shadow: inset 0 0 0 1px #141110; }
    .aw-dot { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); flex-shrink: 0; }
    .aw-cell { display: grid; place-items: center; height: 84px; border-radius: 10px; font: 700 11px 'Inter', sans-serif;
      cursor: pointer; width: 100%; overflow: hidden; position: relative; padding: 0; }
    .aw-cell.has { background: #F3EEE2; border: 1px solid #9CC3A6; }
    .aw-cell.miss { background: #FBF8F1; border: 1.5px dashed #CDBF9F; color: #6B5A36; }
    .aw-cell.miss:hover, .aw-cell.has:hover { border-color: #C9A24B; }
    .aw-table { border-collapse: collapse; width: 100%; font-size: 13px; }
    .aw-table th, .aw-table td { padding: 8px 10px; border-bottom: 1px solid #EFE7D4; text-align: left; }
    .aw-table th { font-size: 12px; color: #5C5547; font-weight: 800; }
    .aw-area { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border-radius: 12px;
      border: 1px solid #E7DFCC; background: #fff; cursor: pointer; text-align: left; font: 600 13px 'Inter', sans-serif;
      color: #141110; min-height: 44px; }
    .aw-area.sel { border-color: #141110; box-shadow: inset 0 0 0 1px #141110; }
    .aw-area .state { margin-left: auto; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
    .aw-area .state.on { background: #E3F2E8; color: #24522F; }
    .aw-area .state.off { background: #F3EEE2; color: #6B5A36; }
    .aw-area .state.nosize { background: #FBEFD2; color: #7A5B12; }
    .aw-wiz { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 20px; align-items: start; margin-top: 18px; }
    .aw-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
    .aw-areas { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 20px; align-items: start; }
    @media (max-width: 900px) {
      .aw-wiz, .aw-areas { grid-template-columns: minmax(0, 1fr); }
      .aw-steps { display: flex; overflow-x: auto; gap: 6px; }
      .aw-steps .aw-step { width: auto; white-space: nowrap; }
      .aw-steps .aw-sub { display: none; }
    }
    @media (max-width: 600px) { .aw-two { grid-template-columns: minmax(0, 1fr); } }
  `,
};

// Shared look of the ready-made shop (grid, filters, product cards).
export const SHOP_CSS = `
  .sh-wrap { --ink: #15130F; --muted: #71695B; --line: #ECE4D2; --gold: #C9A24B; --cream: #FBF7EE; }
  .sh-cats { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 14px; scrollbar-width: thin; }
  .sh-chip { padding: 9px 16px; border-radius: 999px; border: 1px solid var(--line); background: #fff; color: var(--ink);
    font-weight: 600; font-size: 13.5px; font-family: inherit; cursor: pointer; white-space: nowrap; min-height: 40px; }
  .sh-chip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
  .sh-count { opacity: .55; font-weight: 500; margin-left: 2px; }
  .sh-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .sh-search { flex: 1 1 240px; min-width: 0; min-height: 42px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--line);
    font-weight: 500; font-size: 14px; font-family: inherit; color: var(--ink); background: #fff; }
  .sh-search:focus, .sh-filters select:focus { outline: 2px solid var(--gold); outline-offset: 1px; }
  .sh-filters { display: flex; gap: 8px; flex-wrap: wrap; }
  .sh-filters select { min-height: 42px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); background: #fff;
    color: var(--ink); font-weight: 600; font-size: 13px; font-family: inherit; cursor: pointer; }
  .sh-filterbtn { display: none; min-height: 42px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--ink);
    background: #fff; color: var(--ink); font-weight: 700; font-size: 13px; font-family: inherit; cursor: pointer; }
  .sh-swatches { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
  .sh-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 16px 0 14px; font-size: 13.5px; color: var(--muted); }
  .sh-pill { border: none; background: #F4ECD8; color: var(--ink); border-radius: 999px; padding: 6px 12px; font-weight: 600; font-size: 12.5px; font-family: inherit; cursor: pointer; }
  .sh-clear { border: none; background: none; color: #7A5B12; font-weight: 700; font-size: 13px; font-family: inherit; text-decoration: underline; cursor: pointer; padding: 4px; }
  .sh-error { color: #B42318; font-weight: 600; }
  .sh-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 22px 18px; transition: opacity .2s; }
  .sh-grid.is-loading { opacity: .55; }
  .sh-skel { aspect-ratio: 4 / 6; border-radius: 16px; background: linear-gradient(90deg, #F3EFE5, #FAF7F0, #F3EFE5); background-size: 200% 100%;
    animation: sh-shine 1.2s infinite linear; }
  @keyframes sh-shine { to { background-position: -200% 0; } }
  .sh-empty { display: grid; gap: 6px; justify-items: center; text-align: center; padding: 40px 16px; color: var(--muted);
    background: var(--cream); border-radius: 16px; }
  .sh-empty b { color: var(--ink); font-size: 16px; }
  .sh-more-btn { min-height: 46px; padding: 0 26px; border-radius: 999px; border: 1px solid var(--ink); background: #fff; color: var(--ink);
    font-weight: 700; font-size: 14px; font-family: inherit; cursor: pointer; }
  .sh-more-btn:hover { background: var(--ink); color: #fff; }

  .sh-card { min-width: 0; }
  .sh-card-img { position: relative; display: block; aspect-ratio: 4 / 5; border-radius: 16px; overflow: hidden; background: #F3F1EC; }
  .sh-card-img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform .5s ease, opacity .35s ease; }
  .sh-card-alt { opacity: 0; }
  .sh-card-img:hover img { transform: scale(1.04); }
  .sh-card-img:hover .sh-card-alt { opacity: 1; }
  .sh-card.is-out .sh-card-img img { opacity: .55; }
  .sh-card-img:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
  .sh-card-nophoto { position: absolute; inset: 0; display: grid; place-items: center; color: #CDBF9F; font-weight: 800; font-size: 18px; font-family: inherit; letter-spacing: .2em; }
  .sh-badge { position: absolute; top: 10px; left: 10px; font-size: 11px; font-weight: 800; padding: 5px 10px; border-radius: 999px; letter-spacing: .02em; }
  .sh-badge.gold { background: var(--gold); color: var(--ink); }
  .sh-badge.dark { background: var(--ink); color: #fff; }
  .sh-card-body { padding: 10px 2px 0; }
  .sh-card-name { display: block; color: var(--ink); font-weight: 700; font-size: 15px; text-decoration: none; overflow-wrap: anywhere; }
  .sh-card-name:hover { text-decoration: underline; }
  .sh-card-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); }
  .sh-dots { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
  .sh-dot { width: 18px; height: 18px; border-radius: 50%; border: 1px solid transparent; padding: 0; cursor: pointer; }
  .sh-dot.light { border-color: #D8CFBB; }
  .sh-dot.on { box-shadow: 0 0 0 2px #fff, 0 0 0 3.5px var(--ink); }
  .sh-dot.big { width: 28px; height: 28px; }
  .sh-more { font-size: 12px; color: var(--muted); }
  .sh-price { margin: 8px 0 0; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 15.5px; color: var(--ink); }
  .sh-price s { color: var(--muted); font-size: 13px; }
  .sh-member { font-size: 11px; font-weight: 800; color: #2E7D4F; }

  @media (max-width: 1024px) { .sh-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 720px) {
    .sh-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 12px; }
    .sh-filterbtn { display: inline-flex; align-items: center; }
    .sh-filters { display: none; width: 100%; }
    .sh-filters.open { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .sh-filters select { width: 100%; min-width: 0; }
    .sh-card-name { font-size: 14px; }
  }
`;

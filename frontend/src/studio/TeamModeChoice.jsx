// studio/TeamModeChoice.jsx — Review, for a design with a text marked as each person's name / number:
// "What is printed on each tee?" as two picture cards instead of two small buttons, so it is clear what each means:
//   the same design on every tee (pick sizes × quantity)  ·  each person's own name / number (one tee per person, a list)

const PEOPLE = [
  ["ARUN", "7"],
  ["DIVYA", "23"],
  ["KARTHIK", "10"],
];
const TEE = "M30 8 L12 18 L4 40 L18 46 L22 36 L22 104 L78 104 L78 36 L82 46 L96 40 L88 18 L70 8 C 64 16, 36 16, 30 8 Z";

function MiniTee({ fabric, ink, name, number }) {
  return (
    <svg viewBox="0 0 100 110" aria-hidden="true">
      <path d={TEE} fill={fabric} stroke="rgba(21,19,15,.18)" strokeWidth="1.2" />
      {name && (
        <text x="50" y={number ? 40 : 52} textAnchor="middle" fill={ink} style={{ font: "800 11px Inter, Arial, sans-serif", letterSpacing: "0.04em" }}>
          {name}
        </text>
      )}
      {number && (
        <text x="50" y="82" textAnchor="middle" fill={ink} style={{ font: "900 34px Inter, Arial, sans-serif" }}>
          {number}
        </text>
      )}
    </svg>
  );
}

/**
 * @param teamMode  true = each person's own name / number
 * @param onChange  (teamMode) => void
 * @param roles     { name, number } — which of the two the tee has a place for
 * @param sample    { name, number } — what those texts say on the tee now ("PLAYER", "07")
 * @param fabric    the tee colour; ink = a text colour that shows on it
 */
export default function TeamModeChoice({ teamMode, onChange, roles, sample = {}, fabric = "#FFFFFF", ink = "#15130F" }) {
  const what = [roles.name && "name", roles.number && "number"].filter(Boolean).join(" & ");
  const sameName = roles.name ? sample.name || "NAME" : "";
  const sameNumber = roles.number ? sample.number || "07" : "";
  const changing = [roles.name && `“${sample.name || "the name"}” (the name)`, roles.number && `“${sample.number || "the number"}” (the number)`].filter(Boolean).join(" and ");
  return (
    <div className="dr-tm" role="radiogroup" aria-label="What is printed on each tee?">
      <div className="eyebrow">What is printed on each tee?</div>
      <div className="dr-tm-cards">
        <button type="button" role="radio" aria-checked={!teamMode} className={`dr-tm-card${!teamMode ? " on" : ""}`} onClick={() => onChange(false)}>
          <span className="dr-tm-tees">
            {PEOPLE.map((p) => (
              <MiniTee key={p[0]} fabric={fabric} ink={ink} name={sameName} number={sameNumber} />
            ))}
          </span>
          <b>The same on every tee</b>
          <small>Every tee is printed exactly alike. Next: how many of each size.</small>
        </button>
        <button type="button" role="radio" aria-checked={teamMode} className={`dr-tm-card${teamMode ? " on" : ""}`} onClick={() => onChange(true)}>
          <span className="dr-tm-tees">
            {PEOPLE.map(([n, no]) => (
              <MiniTee key={n} fabric={fabric} ink={ink} name={roles.name ? n : ""} number={roles.number ? no : ""} />
            ))}
          </span>
          <b>Each person's own {what}</b>
          <small>One tee per person, with their {what} from your list. Next: add your people.</small>
        </button>
      </div>
      {teamMode && changing && <p className="dr-tm-note">Changes on each tee: {changing}. Everything else stays the same.</p>}
    </div>
  );
}

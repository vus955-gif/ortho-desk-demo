import { REGULY } from "../lib/rules";

/** The rule table exactly as the engine uses it (single source of truth: lib/rules.ts). */
export function RulesList() {
  return (
    <ol className="ladder preview" aria-label="Reguły decyzyjne w kolejności sprawdzania">
      {REGULY.map((rule) => (
        <li key={rule.id} className="rung">
          <span className="num">{rule.id}</span>
          <span className="cond">{rule.nazwa}</span>
          <span className={`mchip c-${rule.tryb}`}>{rule.tryb}</span>
          <span className="reason">{rule.warunek}</span>
        </li>
      ))}
    </ol>
  );
}

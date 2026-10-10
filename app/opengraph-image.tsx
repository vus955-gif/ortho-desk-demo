import { ImageResponse } from "next/og";
import evalJson from "../data/eval-results.json";
import type { EvalFile } from "../lib/evaluate";

export const alt = "Ortho Desk: model opisuje zgłoszenie, reguły decydują o trybie AUTO, DRAFT albo ESKALACJA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ev = evalJson as unknown as EvalFile;

export default function OgImage() {
  const m = ev.status === "zakonczono" ? ev.metryki : undefined;
  const modes = [
    { t: "AUTO", c: "#1e7b5b", bg: "#e3f2ec" },
    { t: "DRAFT", c: "#9a6210", bg: "#fbf0dc" },
    { t: "ESKALACJA", c: "#b3302a", bg: "#fbe6e3" },
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f4f7f6", color: "#17262e", padding: "64px 72px" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 40, fontWeight: 700 }}>Ortho Desk</div>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, marginTop: 28, maxWidth: 1000 }}>
            Model opisuje. Reguły decydują. Ryzyko trafia do człowieka.
          </div>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {modes.map((x) => (
            <div key={x.t} style={{ display: "flex", fontSize: 34, fontWeight: 700, color: x.c, background: x.bg, border: `3px solid ${x.c}`, borderRadius: 12, padding: "10px 22px" }}>
              {x.t}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 28, color: "#56666e" }}>
          <div>Demo triażu zgłoszeń dla fikcyjnego producenta sprzętu ortopedycznego.</div>
          {m && (
            <div style={{ marginTop: 6 }}>
              {`Ewaluacja na 100 zgłoszeniach testowych: tryb trafny ${m.trafnosc_trybu.trafne}/${m.trafnosc_trybu.wszystkie}, incydenty eskalowane ${m.czulosc_incydentow.eskalowane.trafne}/${m.czulosc_incydentow.eskalowane.wszystkie}.`}
            </div>
          )}
        </div>
      </div>
    ),
    size,
  );
}

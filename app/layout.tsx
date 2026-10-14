import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Nav } from "../components/Nav";
import "./globals.css";

const sans = Atkinson_Hyperlegible_Next({ subsets: ["latin", "latin-ext"], variable: "--font-atkinson", display: "swap", adjustFontFallback: false });
const mono = Atkinson_Hyperlegible_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-atkinson-mono", display: "swap", adjustFontFallback: false });

// Absolute URLs for the link-preview image: Vercel provides the production domain at build time.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Ortho Desk: demo",
  description:
    "Demo triażu zgłoszeń klientów fikcyjnego producenta sprzętu ortopedycznego: model opisuje wiadomość, jawne reguły wybierają tryb AUTO, DRAFT lub ESKALACJA.",
  robots: { index: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <header className="topbar">
          <div className="shell">
            <a className="brand" href="/">Ortho Desk</a>
            <p className="tagline">Model opisuje zgłoszenie. Jawne reguły wybierają tryb. Sprawy ryzykowne trafiają do człowieka.</p>
            <Nav />
          </div>
        </header>
        <div className="shell">
          <p className="notice">
            Demo na danych fikcyjnych: firma, produkty, klienci i zgłoszenia są wymyślone. Nic nie jest wysyłane, a wpisanych treści nie zapisujemy.
          </p>
          {children}
          <footer className="footer">
            <p>Specyfikacja, reguły decyzyjne i kryteria oceny: autor projektu. Kod wygenerował Claude Code według tej specyfikacji.</p>
            <p>Klasyfikacja i szkice: Claude Haiku 5.5 (Anthropic API). Tryb wybiera deterministyczny silnik reguł, nie model.</p>
          </footer>
        </div>
        <Analytics />
      </body>
    </html>
  );
}

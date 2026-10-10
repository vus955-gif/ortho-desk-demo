"use client";

// Replaces the root layout if the layout itself fails, so the public link never ends on a bare error.
// It renders its own document and cannot rely on the app's stylesheet.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pl">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f4f7f6", color: "#17262e" }}>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "64px 16px" }}>
          <title>Ortho Desk: błąd</title>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>Strona chwilowo się nie wczytała</h1>
          <p style={{ color: "#56666e", lineHeight: 1.6 }}>Nic nie zostało zapisane. Spróbuj ponownie za chwilę.</p>
          <p style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <button onClick={() => retry()} style={{ font: "inherit", fontWeight: 700, padding: "10px 16px", background: "#17262e", color: "#f4f7f6", border: 0, borderRadius: 4, cursor: "pointer" }}>
              Spróbuj ponownie
            </button>
            <a href="/wyniki" style={{ alignSelf: "center", color: "#17262e" }}>Wyniki ewaluacji</a>
          </p>
        </main>
      </body>
    </html>
  );
}

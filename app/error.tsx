"use client";
import Link from "next/link";

// Last-resort boundary: the page never ends on a raw error, whatever happens in the UI.
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="results">
      <h1 className="headline">Coś poszło nie tak po stronie strony</h1>
      <p className="lede">Zgłoszenie nie zostało nigdzie zapisane. Spróbuj ponownie albo przejdź do wyników ewaluacji.</p>
      <p style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", marginTop: "1rem" }}>
        <button className="btn" onClick={() => retry()}>Spróbuj ponownie</button>
        <Link className="btn quiet" href="/wyniki">Wyniki ewaluacji</Link>
      </p>
    </main>
  );
}

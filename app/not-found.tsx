import Link from "next/link";

export default function NotFound() {
  return (
    <main className="results">
      <h1 className="headline">Tej strony nie ma</h1>
      <p className="lede">
        Demo ma trzy strony: <Link href="/">Demo</Link>, <Link href="/jak-to-dziala">Jak to działa</Link> i <Link href="/wyniki">Wyniki ewaluacji</Link>.
      </p>
    </main>
  );
}

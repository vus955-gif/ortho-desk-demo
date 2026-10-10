import testSet from "../spec/test-cases.json";
import { Demo } from "../components/Demo";
import { KLIENCI, NIEZNANY_NADAWCA } from "../lib/data";
import { wybierzPrzyklady, type ZestawTestowy } from "../lib/testcases";

const set = testSet as ZestawTestowy;

/** `/?przypadek=TC-019` opens any test case in the form, e.g. from the results page. */
export default async function Page({ searchParams }: { searchParams: Promise<{ przypadek?: string | string[] }> }) {
  const { przypadek } = await searchParams;
  const id = typeof przypadek === "string" ? przypadek.trim().toUpperCase() : null;
  const startowy = id ? (set.przypadki.find((p) => p.id === id) ?? null) : null;
  return (
    <main>
      <Demo
        key={startowy?.id ?? "brak"}
        przyklady={wybierzPrzyklady(set.przypadki)}
        nadawcy={KLIENCI.map((k) => ({ email: k.email, nazwa: k.nazwa }))}
        nieznany={NIEZNANY_NADAWCA}
        startowy={startowy}
      />
    </main>
  );
}

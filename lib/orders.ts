import { KLIENCI, ZAMOWIENIA } from "./data";
import type { Klient, OrderCheck, Zamowienie } from "./types";

/** Normalise "zam 20417", "ZAM20417", "zam-20417" → "ZAM-20417". Returns null if no 5-digit number. */
export function normalizeOrderNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{5})/);
  return m ? `ZAM-${m[1]}` : null;
}

/** Deterministic backup: first order number written in the message text. */
export function findOrderNumberInText(text: string): string | null {
  const m = text.match(/\bzam\s*[-_.:#]?\s*(\d{5})\b/i);
  return m ? `ZAM-${m[1]}` : null;
}

export function findCustomer(email: string, klienci: Klient[] = KLIENCI): Klient | null {
  const e = email.trim().toLowerCase();
  return klienci.find((k) => k.email.toLowerCase() === e) ?? null;
}

export function ordersOf(klientId: string, zamowienia: Zamowienie[] = ZAMOWIENIA): Zamowienie[] {
  return zamowienia.filter((z) => z.klient_id === klientId);
}

/**
 * UC1 / rule 6 (status): the order must belong to the sender's test profile.
 * With a number: it must exist and belong to the sender. Without a number: exactly one order.
 */
export function checkOrder(
  nadawca: string,
  nrZamowienia: string | null,
  klienci: Klient[] = KLIENCI,
  zamowienia: Zamowienie[] = ZAMOWIENIA,
): OrderCheck {
  const klient = findCustomer(nadawca, klienci);
  const nr = normalizeOrderNumber(nrZamowienia);

  if (nr) {
    const zam = zamowienia.find((z) => z.nr === nr) ?? null;
    if (!zam)
      return { status: "nie_znaleziono", eligible: false, klient, zamowienie: null, opis: `Zamówienie ${nr} nie istnieje w danych testowych.` };
    if (!klient)
      return { status: "nieznany_nadawca", eligible: false, klient: null, zamowienie: null, opis: `Nadawca nie jest klientem testowym, więc nie można potwierdzić prawa do zamówienia ${nr}.` };
    if (zam.klient_id !== klient.id)
      return { status: "inny_klient", eligible: false, klient, zamowienie: null, opis: `Zamówienie ${nr} należy do innego klienta niż nadawca; danych nie ujawniamy.` };
    return { status: "zgodne", eligible: true, klient, zamowienie: zam, opis: `Zamówienie ${nr} należy do nadawcy (${klient.nazwa}).` };
  }

  if (!klient)
    return { status: "nieznany_nadawca", eligible: false, klient: null, zamowienie: null, opis: "Nadawca nie jest klientem testowym i nie podał numeru zamówienia." };
  const own = ordersOf(klient.id, zamowienia);
  if (own.length === 1)
    return { status: "jedno_zamowienie", eligible: true, klient, zamowienie: own[0], opis: `Brak numeru, ale nadawca ma dokładnie jedno zamówienie (${own[0].nr}).` };
  if (own.length === 0)
    return { status: "brak_zamowien", eligible: false, klient, zamowienie: null, opis: "Nadawca nie ma zamówień w danych testowych." };
  return { status: "wiele_zamowien", eligible: false, klient, zamowienie: null, opis: `Brak numeru, a nadawca ma ${own.length} zamówienia; potrzebna prośba o numer.` };
}

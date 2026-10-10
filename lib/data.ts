// Fictional reference data (catalog, test customers, orders, knowledge base), bundled at build time.
import catalogJson from "../data/catalog.json";
import customersJson from "../data/customers.json";
import kbJson from "../data/kb.json";
import type { Artykul, Klient, Produkt, Zamowienie } from "./types";

export const PRODUKTY: Produkt[] = catalogJson.produkty as Produkt[];
export const KLIENCI: Klient[] = customersJson.klienci as Klient[];
export const ZAMOWIENIA: Zamowienie[] = customersJson.zamowienia as Zamowienie[];
export const ARTYKULY_WSZYSTKIE: Artykul[] = kbJson.artykuly as Artykul[];
/** Only approved articles are ever used as sources (spec ch. 9: status zatwierdzony / wycofany). */
export const ARTYKULY: Artykul[] = ARTYKULY_WSZYSTKIE.filter((a) => a.status === "zatwierdzony");

export const NIEZNANY_NADAWCA = "nieznany.nadawca@example.org";

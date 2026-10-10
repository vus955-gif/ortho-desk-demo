// Fixed, non-AI texts (spec UC5: acknowledgement for escalated cases comes from a fixed template).
import type { Jezyk } from "./types";

export const POTWIERDZENIE_ESKALACJI: Record<Jezyk, string> = {
  pl: `Dzień dobry,

potwierdzamy otrzymanie zgłoszenia. Sprawa otrzymała wysoki priorytet i została przekazana osobie odpowiedzialnej, która skontaktuje się z Państwem bezpośrednio.

Jeśli potrzebna jest pilna pomoc medyczna, prosimy skontaktować się z lekarzem lub z numerem alarmowym 112.

Zespół obsługi klienta`,
  en: `Hello,

we confirm that we have received your message. It has been given high priority and passed to the person responsible, who will contact you directly.

If you need urgent medical help, please contact a doctor or the emergency number 112.

Customer Service Team`,
};

/** AI-generated replies are labelled (spec ch. 12: transparency, AI Act art. 50 in scope of a real deployment). */
export const STOPKA_AUTO: Record<Jezyk, string> = {
  pl: "Odpowiedź przygotowana automatycznie przez system AI na podstawie danych zamówienia lub zatwierdzonej bazy wiedzy (demo Ortho Desk, dane fikcyjne).",
  en: "This reply was prepared automatically by an AI system from order data or the approved knowledge base (Ortho Desk demo, fictional data).",
};

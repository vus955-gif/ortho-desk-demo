"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const path = usePathname();
  const items = [
    { href: "/", label: "Demo" },
    { href: "/jak-to-dziala", label: "Jak to działa" },
    { href: "/wyniki", label: "Wyniki ewaluacji" },
  ];
  return (
    <nav className="nav" aria-label="Główna nawigacja">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={path === i.href ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

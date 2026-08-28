import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import type { ReactNode } from "react";

import "../globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif-display",
  display: "swap",
});

/**
 * Panel de operación.
 *
 * Vive fuera del árbol de idioma: es una herramienta interna, siempre en
 * español, y no debe indexarse.
 *
 * **Diseñado móvil primero**, por decisión pendiente del cliente que se asumió:
 * si recepción lo opera desde el celular, un panel de escritorio no sirve; al
 * revés sí. Ante la duda, se elige lo que funciona en ambos.
 */
export const metadata: Metadata = {
  title: "Panel · adriMarket",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${dmSans.variable} ${dmSerifDisplay.variable}`}>
      <body>
        <main id="content" className="wrap admin">
          {children}
        </main>
      </body>
    </html>
  );
}

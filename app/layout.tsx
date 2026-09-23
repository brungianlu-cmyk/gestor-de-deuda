import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Estructura — Documentos jurídicos",
  description: "Transformá planillas de deuda en texto jurídico con OCR y asistencia de IA.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}

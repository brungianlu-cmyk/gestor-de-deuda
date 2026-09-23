import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Estructura — Documentos jurídicos",
  description: "Transformá planillas de deuda en texto jurídico con OCR y asistencia de IA.",
  icons: {
    icon: "/favicon-ba.svg",
    shortcut: "/favicon-ba.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f8f9",
  viewportFit: "cover",
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

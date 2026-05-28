import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StreamLine — AI Sensemaking Dashboard",
  description:
    "Understand complex issues beyond the headlines. Structured intelligence, not just a news feed.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}

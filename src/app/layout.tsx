import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Roundtable",
  description: "A mock-first multi-model roundtable meeting system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import ToastProvider from "@/components/ToastProvider";
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "MolWorld",
  description: "Meme hub for lovely mol stickers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

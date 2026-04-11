import type { Metadata } from "next";
import { EdgeNavigation } from "@/components/edge-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "InfoBoard Dashboard",
  description: "Widget dashboard optimized for portrait monitor setup",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <EdgeNavigation />
        {children}
      </body>
    </html>
  );
}

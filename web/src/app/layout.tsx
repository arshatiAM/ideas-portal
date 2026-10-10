import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { ConfigNotice } from "@/components/ConfigNotice";

export const metadata: Metadata = {
  title: "Ideas Portal",
  description:
    "A global portal for crowd-sourced solutions to public challenges. Launch challenge: reduce traffic between Dubai and Sharjah.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f6b61" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          <ConfigNotice />
          <main className="mx-auto min-h-[70vh] w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}

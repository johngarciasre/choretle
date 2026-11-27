import type { Metadata } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import "./globals.css";
import { IdleGuard } from "@/components/IdleGuard";

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Choretle",
  description: "Chores, points & fun for the whole household",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${baloo.variable} ${nunito.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <IdleGuard />
      </body>
    </html>
  );
}

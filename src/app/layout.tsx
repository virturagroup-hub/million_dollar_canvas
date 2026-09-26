import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Million Dollar Canvas — Drawing Studio",
  description: "One deliberate stroke at a time. A local drawing prototype.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

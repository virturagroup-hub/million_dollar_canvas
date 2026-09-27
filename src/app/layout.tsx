import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Million Dollar Canvas — Drawing Studio",
  description:
    "One million strokes. One permanent artwork. Explore shared canvases and make your mark.",
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

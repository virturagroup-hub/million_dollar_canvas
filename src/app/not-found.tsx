import Link from "next/link";
export default function NotFound() {
  return (
    <main className="gallery">
      <h1>That canvas isn’t here.</h1>
      <p>Find an open canvas and make your mark.</p>
      <Link href="/">Return to the gallery →</Link>
    </main>
  );
}

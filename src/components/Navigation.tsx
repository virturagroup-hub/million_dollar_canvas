import Link from "next/link";
export default function Navigation() {
  return (
    <nav aria-label="Main navigation">
      <Link href="/">Home</Link>
      <Link href="/#canvases">Canvases</Link>
      <Link href="/archive">Archive</Link>
    </nav>
  );
}

import { notFound } from "next/navigation";
import Studio from "@/components/Studio";
import { authNotice } from "@/domain/authNotice";
export default async function CanvasPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  return (
    <Studio key={slug} slug={slug} notice={authNotice(await searchParams)} />
  );
}

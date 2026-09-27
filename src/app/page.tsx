import Gallery from "@/components/Gallery";
import { authNotice } from "@/domain/authNotice";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <Gallery notice={authNotice(await searchParams)} />;
}

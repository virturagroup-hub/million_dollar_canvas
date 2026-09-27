import { repository } from "@/server/repository";
import { failure, json } from "@/server/http";
import { RequestError } from "@/server/submission";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const section = params.get("section") ?? "current";
    const offset = params.get("offset") ?? "0";
    if (!["current", "archive"].includes(section) || !/^\d{1,5}$/.test(offset))
      throw new RequestError(400, "Invalid gallery page.");
    return json(
      await (
        await repository()
      ).catalog(section as "current" | "archive", Number(offset)),
    );
  } catch (error) {
    return failure(error);
  }
}

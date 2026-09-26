export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "The service returned an unexpected response. Please try again.",
    );
  }
  if (!response.ok)
    throw new Error(body.error ?? "The request could not be completed.");
  return body;
}

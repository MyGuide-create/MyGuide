import { redirect } from "next/navigation";

/**
 * The old guide feed. Since places first (12 Oct 2026) a city's spots and guides live on the city
 * page and every city on /cities, so old links go there.
 */
export default async function FeedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const city = typeof sp.city === "string" ? sp.city.trim() : "";
  redirect(city ? `/city?${new URLSearchParams({ name: city }).toString()}` : "/cities");
}

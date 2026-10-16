import { redirect } from "next/navigation";

/** Saved places is now My spots (12 Oct 2026); old links keep working. */
export default async function SavedPlacesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  redirect(`/my-places${qs ? `?${qs}` : ""}`);
}

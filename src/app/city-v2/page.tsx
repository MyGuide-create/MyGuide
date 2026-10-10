import { redirect } from "next/navigation";

/** The preview became the real city page; old links keep their city. */
export default async function CityV2Redirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  redirect(`/city${qs.size ? `?${qs.toString()}` : ""}`);
}

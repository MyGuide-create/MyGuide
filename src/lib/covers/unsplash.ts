/**
 * Unsplash photo search for guide covers.
 * Follows the Unsplash API guidelines: images are hotlinked (never re-hosted),
 * the download endpoint is pinged when a photo is chosen, and every use is
 * credited to the photographer with links back to Unsplash.
 */

const API = "https://api.unsplash.com";
const UTM = "utm_source=myguide&utm_medium=referral";

export interface UnsplashPhoto {
  id: string;
  thumb: string;
  url: string;
  alt: string;
  author: string;
  authorUrl: string;
}

interface RawPhoto {
  id: string;
  alt_description?: string | null;
  description?: string | null;
  urls: { small: string; regular: string };
  links: { download_location: string };
  user: { name: string; links: { html: string } };
}

export function hasUnsplashKey(): boolean {
  return !!process.env.UNSPLASH_ACCESS_KEY?.trim();
}

export { UNSPLASH_HOME } from "./shared";

async function ufetch<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY?.trim()}`, "Accept-Version": "v1" },
    cache: "no-store",
  });
  if (!res.ok) {
    console.warn(`[unsplash] ${path} -> ${res.status}`);
    return null;
  }
  return (await res.json()) as T;
}

function toPhoto(p: RawPhoto): UnsplashPhoto {
  return {
    id: p.id,
    thumb: p.urls.small,
    url: p.urls.regular,
    alt: p.alt_description || p.description || "",
    author: p.user.name,
    authorUrl: `${p.user.links.html}?${UTM}`,
  };
}

export async function searchUnsplash(query: string, page = 1): Promise<UnsplashPhoto[]> {
  if (!hasUnsplashKey() || !query.trim()) return [];
  const q = encodeURIComponent(query.trim());
  const data = await ufetch<{ results: RawPhoto[] }>(`/search/photos?query=${q}&per_page=24&page=${page}&orientation=landscape&content_filter=high`);
  return (data?.results ?? []).map(toPhoto);
}

/** Look a photo up by id and register the download, as Unsplash requires when a photo is used. */
export async function claimUnsplashPhoto(id: string): Promise<UnsplashPhoto | null> {
  if (!hasUnsplashKey() || !/^[A-Za-z0-9_-]{4,40}$/.test(id)) return null;
  const raw = await ufetch<RawPhoto>(`/photos/${id}`);
  if (!raw) return null;
  const dl = raw.links.download_location.replace(API, "");
  void ufetch(dl.startsWith("/") ? dl : `/photos/${id}/download`);
  return toPhoto(raw);
}

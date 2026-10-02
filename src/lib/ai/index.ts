import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORIES } from "../places/categories";
import { findCity } from "../places/cities";
import {
  heuristicParsePlaces,
  heuristicPolishNote,
  heuristicSearchIntent,
  type ParsedPlaceList,
  type SearchIntent,
} from "./heuristics";

export type { ParsedPlaceList, SearchIntent };

export function hasAnthropicKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

function model(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5";
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const ParsedPlaceListSchema = z.object({
  title: z.string(),
  city: z.string(),
  country: z.string(),
  places: z.array(
    z.object({
      name: z.string(),
      cityHint: z.string(),
    }),
  ),
});

/**
 * Turn a spoken or typed list of places into structured place names plus a
 * suggested title. Only structures what the creator said: never invents
 * places they did not name.
 */
export async function parsePlaceList(transcript: string, cityHint?: string): Promise<ParsedPlaceList> {
  const fallback = () => heuristicParsePlaces(transcript, cityHint);
  if (!hasAnthropicKey() || !transcript.trim()) return fallback();

  try {
    const response = await getClient().messages.parse({
      model: model(),
      max_tokens: 2048,
      output_config: { effort: "low", format: zodOutputFormat(ParsedPlaceListSchema) },
      system: [
        "You structure a traveller's spoken list of places into JSON for a personal city guide app called MyGuide.",
        "Rules:",
        "- Extract ONLY the places the speaker actually named. Never add, suggest or 'complete' places.",
        "- Keep each place name as the speaker said it, cleaned of filler words. Keep neighbourhood qualifiers out of the name and put them into cityHint (e.g. 'Ichiran in Shinjuku' -> name 'Ichiran', cityHint 'Shinjuku, Tokyo').",
        "- cityHint should be the most specific 'Area, City' you can infer for the place. If you cannot tell, use the guide-level city.",
        "- city/country: the city the guide is about. Infer it from the places if the speaker did not say it; empty string if unknown.",
        "- title: a short, warm, personal guide title in the speaker's voice (max 6 words), e.g. 'Tokyo, Slowly' or 'My Athens Weekend'. Do not use quotes.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `${cityHint ? `Guide city hint: ${cityHint}\n` : ""}Transcript:\n${transcript}`,
        },
      ],
    });
    const parsed = response.parsed_output;
    if (!parsed || !parsed.places.length) return fallback();
    const known = findCity(parsed.city) ?? findCity(cityHint);
    return {
      title: parsed.title.trim() || fallback().title,
      city: parsed.city.trim() || known?.city || "",
      country: parsed.country.trim() || known?.country || "",
      places: parsed.places
        .map((p) => ({ name: p.name.trim(), cityHint: p.cityHint.trim() || parsed.city.trim() || cityHint }))
        .filter((p) => p.name),
    };
  } catch (e) {
    console.warn("[ai] parsePlaceList failed, using heuristics:", e instanceof Error ? e.message : e);
    return fallback();
  }
}

const SearchIntentSchema = z.object({
  keywords: z.array(z.string()),
  city: z.string(),
  country: z.string(),
  scope: z.enum(["public", "following"]),
  category: z.enum(["", ...CATEGORIES]),
  byUsername: z.string(),
});

/** Interpret a natural-language (often spoken) request for guides. */
export async function interpretSearch(query: string): Promise<SearchIntent> {
  const fallback = () => heuristicSearchIntent(query);
  if (!hasAnthropicKey() || !query.trim()) return fallback();
  try {
    const response = await getClient().messages.parse({
      model: model(),
      max_tokens: 512,
      output_config: { effort: "low", format: zodOutputFormat(SearchIntentSchema) },
      system: [
        "You convert a traveller's natural-language request into a structured search over city guides in the MyGuide app.",
        "- scope: 'following' when they ask for guides by people they follow / their friends / their network; otherwise 'public'.",
        "- city/country: the destination if one is named (canonical English name, e.g. 'Mexico City', 'Mexico'); empty strings otherwise.",
        `- category: one of ${CATEGORIES.join(" | ")} when the request clearly targets one theme (food, nightlife, wellness...), else empty string.`,
        "- byUsername: a specific creator's username if they say 'by @name' or 'by name'; else empty string.",
        "- keywords: up to 5 distinctive words worth matching against guide titles/descriptions (no stop words, no city names).",
      ].join("\n"),
      messages: [{ role: "user", content: query }],
    });
    const p = response.parsed_output;
    if (!p) return fallback();
    const known = findCity(p.city);
    return {
      keywords: p.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean).slice(0, 6),
      city: known?.city || p.city.trim() || undefined,
      country: known?.country || p.country.trim() || undefined,
      scope: p.scope,
      category: p.category || undefined,
      byUsername: p.byUsername.replace(/^@/, "").trim() || undefined,
    };
  } catch (e) {
    console.warn("[ai] interpretSearch failed, using heuristics:", e instanceof Error ? e.message : e);
    return fallback();
  }
}

/** Tidy a dictated note without changing its meaning or voice. */
export async function polishNote(note: string, placeName?: string): Promise<string> {
  if (!note.trim()) return note;
  if (!hasAnthropicKey()) return heuristicPolishNote(note);
  try {
    const response = await getClient().messages.create({
      model: model(),
      max_tokens: 400,
      output_config: { effort: "low" },
      system:
        "You lightly edit a friend's dictated recommendation for a place in their personal city guide. Fix transcription slips, punctuation and filler words. Keep it first-person, keep their voice and every concrete detail, do not add facts or marketing tone, and keep it roughly the same length. Reply with the edited note only.",
      messages: [{ role: "user", content: `${placeName ? `Place: ${placeName}\n` : ""}Note: ${note}` }],
    });
    if (response.stop_reason === "refusal") return heuristicPolishNote(note);
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || heuristicPolishNote(note);
  } catch (e) {
    console.warn("[ai] polishNote failed, using heuristics:", e instanceof Error ? e.message : e);
    return heuristicPolishNote(note);
  }
}

const ScreenshotPlacesSchema = z.object({
  listTitle: z.string(),
  city: z.string(),
  places: z.array(z.object({ name: z.string(), area: z.string() })),
});

export interface ScreenshotPlaces {
  listTitle: string;
  city: string;
  places: Array<{ name: string; area: string }>;
}

/**
 * Read place names off a screenshot (a Google Maps saved list, an Instagram post,
 * a friend's notes…). Returns only places actually visible in the image.
 * Throws "no_ai" when no API key is configured.
 */
export async function placesFromScreenshot(base64: string, mediaType: "image/jpeg" | "image/png" | "image/webp"): Promise<ScreenshotPlaces> {
  if (!hasAnthropicKey()) throw new Error("no_ai");
  const response = await getClient().messages.parse({
    model: model(),
    max_tokens: 2048,
    output_config: { effort: "low", format: zodOutputFormat(ScreenshotPlacesSchema) },
    system: [
      "You read screenshots for MyGuide, a personal city guide app, and list the places (restaurants, cafés, bars, shops, hotels, beaches, attractions…) that appear in them.",
      "Rules:",
      "- Only places whose names are clearly visible in the image. Never guess, complete or add places.",
      "- Copy each name exactly as shown (keep accents and capitalisation). Do not include ratings, prices, categories, distances or opening hours in the name.",
      "- Skip anything marked 'Permanently closed'. Skip app UI text, buttons, ads and the list's own title.",
      "- area: the neighbourhood or city shown for that place, or inferred from the list title (e.g. a list called 'London'); empty string if unknown.",
      "- listTitle: the list or post title if one is visible, else empty. city: the main city these places are in, else empty.",
      "- If the image contains no places, return an empty places array.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: "List the places in this screenshot." },
        ],
      },
    ],
  });
  const parsed = response.parsed_output;
  if (!parsed) return { listTitle: "", city: "", places: [] };
  return {
    listTitle: parsed.listTitle.trim(),
    city: parsed.city.trim(),
    places: parsed.places.map((p) => ({ name: p.name.trim(), area: p.area.trim() })).filter((p) => p.name),
  };
}

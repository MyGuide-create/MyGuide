"use client";

import { useEffect, useRef, useState } from "react";
import { askOnMyGuide, createAskLink } from "@/lib/actions/requests";
import type { PublicUser } from "@/lib/auth";
import { errorText } from "@/lib/errorText";
import { CityPicker, type PickedCity } from "./CityPicker";
import { CheckIcon, SparkleIcon, WhatsAppIcon, XIcon } from "./Icons";
import { Sheet } from "./ShareSheet";
import { Avatar, Button, Label, Spinner, Textarea, cx } from "./ui";

type City = { city: string; country?: string; lat?: number | null; lng?: number | null };

/**
 * "Ask a friend for a guide": pick the city, pick people on MyGuide and/or send a link on WhatsApp.
 * People on MyGuide get a notification; anyone else gets a personal link that signs them up
 * straight into making the guide. Either way the finished guide comes back through your wish list.
 */
export function AskForGuideButton({
  city,
  person,
  label,
  variant = "outline",
  size = "sm",
  className,
}: {
  city?: City | null;
  /** Asking a specific person (from their profile). */
  person?: PublicUser | null;
  label?: string;
  variant?: "primary" | "outline" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} className={className}>
        <SparkleIcon size={14} /> {label ?? (person ? `Ask ${person.displayName.split(" ")[0]} for a guide` : city ? `Ask a friend for a ${city.city} guide` : "Ask a friend for a guide")}
      </Button>
      {open && <AskSheet city={city ?? null} person={person ?? null} onClose={() => setOpen(false)} />}
    </>
  );
}

function AskSheet({ city: initialCity, person, onClose }: { city: City | null; person: PublicUser | null; onClose: () => void }) {
  const [city, setCity] = useState<City | null>(initialCity);
  const [picked, setPicked] = useState<PublicUser[]>(person ? [person] : []);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "app" | "link">(null);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string[] | null>(null);
  const [linkSent, setLinkSent] = useState(false);
  const [copied, setCopied] = useState(false);
  /** The ask link is made; the message waits for a tap that opens WhatsApp (a real tap is what makes phones open the contact picker). */
  const [ready, setReady] = useState<string | null>(null);

  const input = () => ({ city: city!.city, country: city!.country ?? "", lat: city!.lat ?? null, lng: city!.lng ?? null, note });

  const sendApp = async () => {
    if (!city || !picked.length) return;
    setBusy("app");
    setError(null);
    try {
      await askOnMyGuide({ ...input(), userIds: picked.map((p) => p.id) });
      setSentTo(picked.map((p) => p.displayName.split(" ")[0]));
    } catch (e) {
      setError(errorText(e, "Couldn't send your ask."));
    } finally {
      setBusy(null);
    }
  };

  /** Step 1: make the personal link (needs the server). Step 2 is a real link the person taps. */
  const prepareLink = async () => {
    if (!city) return;
    setBusy("link");
    setError(null);
    try {
      const { message } = await createAskLink(input());
      setReady(message);
    } catch (e) {
      setError(errorText(e, "Couldn't make your ask link."));
    } finally {
      setBusy(null);
    }
  };

  const shareOther = async (message: string) => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: message });
        setLinkSent(true);
      } catch {
        /* closed the share sheet */
      }
      return;
    }
    await copy(message);
  };

  const copy = async (message: string) => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setLinkSent(true);
    } catch {
      setError("Couldn’t copy — press and hold the message above to copy it.");
    }
  };

  if (sentTo || linkSent) {
    return (
      <Sheet title="Ask sent" onClose={onClose}>
        <div className="flex flex-col items-center text-center gap-3 py-4">
          <span className="w-14 h-14 rounded-full bg-sage-tint text-sage flex items-center justify-center"><CheckIcon size={26} /></span>
          <p className="text-[15px] leading-snug">
            {sentTo ? <>Asked <b>{sentTo.join(", ")}</b> for a {city?.city} guide.</> : copied ? <>Message copied — paste it to your friend.</> : <>Your {city?.city} ask is on its way.</>}
          </p>
          <p className="text-[13px] text-ink-muted leading-relaxed">We&apos;ll tell you when they open it and when your guide is ready. You can follow it on your wish list.</p>
          <div className="mt-2 flex flex-col gap-2 w-full">
            {sentTo && <Button variant="outline" onClick={() => setSentTo(null)}>Ask someone else too</Button>}
            {linkSent && <Button variant="outline" onClick={() => { setLinkSent(false); setReady(null); setCopied(false); }}>Ask someone else too</Button>}
            <Button variant="ghost" onClick={onClose}>Done</Button>
          </div>
        </div>
      </Sheet>
    );
  }

  if (ready) {
    // whatsapp://send opens the app's "send to…" contact picker on phones. wa.me (the web link) sometimes
    // only opens WhatsApp's chat list instead, especially from a home-screen app — that's what Shaz hit.
    const mobile = typeof navigator !== "undefined" && /iphone|ipad|ipod|android/i.test(navigator.userAgent);
    const waHref = mobile ? `whatsapp://send?text=${encodeURIComponent(ready)}` : `https://wa.me/?text=${encodeURIComponent(ready)}`;
    return (
      <Sheet title="Send your ask" onClose={onClose}>
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-muted">Your message with your personal link:</p>
          <p className="rounded-2xl border border-line bg-paper px-3.5 py-3 text-left text-[13px] leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere] select-all">{ready}</p>
          <a
            href={waHref}
            onClick={() => setTimeout(() => setLinkSent(true), 800)}
            className="h-12 rounded-full bg-[#25D366] text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2"
          >
            <WhatsAppIcon size={18} /> Open WhatsApp and pick who
          </a>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => shareOther(ready)}>Other apps</Button>
            <Button variant="outline" className="flex-1" onClick={() => copy(ready)}>Copy message</Button>
          </div>
          {error && <p className="text-[12.5px] text-danger">{error}</p>}
          <p className="text-[11.5px] text-ink-faint text-center">WhatsApp opened without a contact list? Go back, tap Copy message and paste it into the chat.</p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Ask for a guide" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div>
          <Label htmlFor="ask-city">Where are you going?</Label>
          {city ? (
            <div className="flex items-center justify-between rounded-xl border border-line bg-paper px-3.5 h-12">
              <span className="text-[15px] font-medium">{[city.city, city.country].filter(Boolean).join(", ")}</span>
              {!initialCity && <button type="button" onClick={() => setCity(null)} className="text-[13px] font-medium text-terracotta">Change</button>}
            </div>
          ) : (
            <CityPicker id="ask-city" autoFocus onPick={(c: PickedCity) => setCity(c)} onFreeText={(t) => setCity({ city: t })} />
          )}
        </div>

        <div>
          <Label>Who knows it?</Label>
          {picked.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {picked.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-terracotta-tint pl-1 pr-2 py-1 text-[13px] font-medium">
                  <Avatar user={p} size={22} /> {p.displayName}
                  {p.id !== person?.id && (
                    <button type="button" aria-label={`Remove ${p.displayName}`} onClick={() => setPicked((x) => x.filter((y) => y.id !== p.id))} className="text-ink-muted"><XIcon size={13} /></button>
                  )}
                </span>
              ))}
            </div>
          )}
          <PeopleSearch exclude={picked.map((p) => p.id)} onPick={(u) => setPicked((x) => [...x, u])} />
        </div>

        <div>
          <Label htmlFor="ask-note">A note (optional)</Label>
          <Textarea id="ask-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Going next week with the boys — mostly food and nightlife" />
        </div>

        {error && <p className="text-[12.5px] text-danger">{error}</p>}

        <div className="flex flex-col gap-2.5">
          {picked.length > 0 && (
            <Button size="lg" disabled={!city || !!busy} onClick={sendApp}>
              {busy === "app" ? <Spinner /> : `Send to ${picked.length === 1 ? picked[0].displayName.split(" ")[0] : `${picked.length} people`} on MyGuide`}
            </Button>
          )}
          <div className={cx("rounded-2xl border border-line bg-paper p-3.5", picked.length ? "" : "border-terracotta-soft")}>
            <p className="text-[13px] font-semibold">Friend not on MyGuide?</p>
            <p className="text-[12px] text-ink-muted leading-snug">Send them a personal link — they sign up in a minute and land straight in your guide.</p>
            <div className="mt-2.5 flex gap-2">
              <Button size="sm" disabled={!city || !!busy} onClick={prepareLink} className="flex-1 bg-[#25D366]! hover:bg-[#1ebe5b]! text-white! border-transparent!">
                {busy === "link" ? <Spinner /> : <><WhatsAppIcon size={15} /> WhatsApp</>}
              </Button>
              <Button size="sm" variant="outline" disabled={!city || !!busy} onClick={prepareLink} className="flex-1">Other apps</Button>
            </div>
          </div>
          {!city && <p className="text-[12px] text-ink-faint text-center">Pick the city first.</p>}
        </div>
      </div>
    </Sheet>
  );
}

/** People on MyGuide: the ones you follow come up first as you type. */
function PeopleSearch({ exclude, onPick }: { exclude: string[]; onPick: (u: PublicUser) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (q.trim().length < 1) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const data = (await res.json()) as { users: PublicUser[] };
        setItems(data.users ?? []);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);
  const shown = q.trim() ? items.filter((u) => !exclude.includes(u.id)) : [];
  return (
    <div>
      <div className="relative">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); if (!e.target.value.trim()) setItems([]); }}
          placeholder="Search people on MyGuide"
          autoComplete="off"
          className="w-full h-12 rounded-xl border border-line bg-paper px-3.5 text-[15px] outline-none placeholder:text-ink-faint focus:border-terracotta-soft"
        />
        {loading && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-faint"><Spinner /></span>}
      </div>
      {shown.length > 0 && (
        <ul className="mt-1.5 rounded-2xl border border-line bg-paper overflow-hidden">
          {shown.slice(0, 6).map((u) => (
            <li key={u.id}>
              <button type="button" onClick={() => { onPick(u); setQ(""); setItems([]); }} className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 hover:bg-cream-deep/50">
                <Avatar user={u} size={32} />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium truncate">{u.displayName}</span>
                  <span className="block text-[12px] text-ink-muted truncate">@{u.username}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length > 1 && !loading && shown.length === 0 && <p className="mt-1.5 text-[12px] text-ink-muted">Nobody by that name yet — send them a link below.</p>}
    </div>
  );
}

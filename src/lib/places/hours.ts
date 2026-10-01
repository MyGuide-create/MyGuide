/**
 * Turns Google's weekday descriptions ("Monday: 11:45 AM – 11:00 PM") into
 * "Open now · closes 11 PM" style summaries, in the place's own time zone.
 */
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

type Range = { open: number; close: number }; // minutes since midnight; close may be > 1440 for overnight
type Day = { closed: boolean; allDay: boolean; ranges: Range[]; text: string };

const COUNTRY_TZ: Record<string, string> = {
  "United Arab Emirates": "Asia/Dubai", Oman: "Asia/Muscat", Qatar: "Asia/Qatar", Bahrain: "Asia/Bahrain",
  Kuwait: "Asia/Kuwait", "Saudi Arabia": "Asia/Riyadh", Lebanon: "Asia/Beirut", Jordan: "Asia/Amman",
  Egypt: "Africa/Cairo", Turkey: "Europe/Istanbul", "Türkiye": "Europe/Istanbul", Greece: "Europe/Athens",
  Cyprus: "Asia/Nicosia", Georgia: "Asia/Tbilisi", Armenia: "Asia/Yerevan", Azerbaijan: "Asia/Baku",
  "United Kingdom": "Europe/London", Ireland: "Europe/Dublin", Portugal: "Europe/Lisbon", Spain: "Europe/Madrid",
  France: "Europe/Paris", Italy: "Europe/Rome", Germany: "Europe/Berlin", Netherlands: "Europe/Amsterdam",
  Belgium: "Europe/Brussels", Switzerland: "Europe/Zurich", Austria: "Europe/Vienna", Czechia: "Europe/Prague",
  "Czech Republic": "Europe/Prague", Hungary: "Europe/Budapest", Poland: "Europe/Warsaw", Croatia: "Europe/Zagreb",
  Denmark: "Europe/Copenhagen", Sweden: "Europe/Stockholm", Norway: "Europe/Oslo", Finland: "Europe/Helsinki",
  Morocco: "Africa/Casablanca", "South Africa": "Africa/Johannesburg", Kenya: "Africa/Nairobi", Tanzania: "Africa/Dar_es_Salaam",
  India: "Asia/Kolkata", "Sri Lanka": "Asia/Colombo", Maldives: "Indian/Maldives", Nepal: "Asia/Kathmandu",
  Thailand: "Asia/Bangkok", Vietnam: "Asia/Ho_Chi_Minh", Cambodia: "Asia/Phnom_Penh", Malaysia: "Asia/Kuala_Lumpur",
  Singapore: "Asia/Singapore", Philippines: "Asia/Manila", "Hong Kong": "Asia/Hong_Kong", Taiwan: "Asia/Taipei",
  China: "Asia/Shanghai", Japan: "Asia/Tokyo", "South Korea": "Asia/Seoul", "New Zealand": "Pacific/Auckland",
  Argentina: "America/Argentina/Buenos_Aires", Colombia: "America/Bogota", Peru: "America/Lima", Chile: "America/Santiago",
};

/** IANA time zone for a place, from its country (and longitude for wide countries). */
export function placeTimeZone(country?: string | null, lng?: number | null): string | null {
  if (!country) return null;
  if (COUNTRY_TZ[country]) return COUNTRY_TZ[country];
  if (lng == null) return null;
  switch (country) {
    case "Indonesia":
      return lng < 112.5 ? "Asia/Jakarta" : lng < 127.5 ? "Asia/Makassar" : "Asia/Jayapura";
    case "United States":
      return lng > -87 ? "America/New_York" : lng > -101 ? "America/Chicago" : lng > -114 ? "America/Denver" : lng > -140 ? "America/Los_Angeles" : "Pacific/Honolulu";
    case "Canada":
      return lng > -66 ? "America/Halifax" : lng > -90 ? "America/Toronto" : lng > -102 ? "America/Winnipeg" : lng > -115 ? "America/Edmonton" : "America/Vancouver";
    case "Mexico":
      return lng > -106 ? "America/Mexico_City" : "America/Tijuana";
    case "Australia":
      return lng > 150 ? "Australia/Sydney" : lng > 141 ? "Australia/Brisbane" : lng > 129 ? "Australia/Adelaide" : "Australia/Perth";
    case "Brazil":
      return lng > -52 ? "America/Sao_Paulo" : "America/Manaus";
    default:
      return null;
  }
}

function parseTime(t: string, fallbackMeridiem?: string): { min: number; meridiem?: string } | null {
  const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const mer = (m[3] ?? fallbackMeridiem)?.toLowerCase();
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  return { min: h * 60 + min, meridiem: mer };
}

function parseDay(text: string): Day | null {
  const clean = text.replace(/[   ]/g, " ").replace(/\s+/g, " ").trim();
  const idx = clean.indexOf(":");
  if (idx < 0) return null;
  const body = clean.slice(idx + 1).trim();
  if (/closed/i.test(body)) return { closed: true, allDay: false, ranges: [], text: clean };
  if (/24 hours/i.test(body)) return { closed: false, allDay: true, ranges: [], text: clean };
  const ranges: Range[] = [];
  for (const seg of body.split(",")) {
    const [a, b] = seg.split(/\s*[–-]\s*/);
    if (!a || !b) continue;
    const endProbe = b.match(/(am|pm)\s*$/i)?.[1];
    const start = parseTime(a, endProbe);
    const end = parseTime(b);
    if (!start || !end) continue;
    ranges.push({ open: start.min, close: end.min <= start.min ? end.min + 1440 : end.min });
  }
  return ranges.length ? { closed: false, allDay: false, ranges, text: clean } : null;
}

function parseWeek(lines: string[]): (Day | null)[] | null {
  const week: (Day | null)[] = Array(7).fill(null);
  let found = 0;
  for (const line of lines) {
    const name = line.slice(0, line.indexOf(":")).trim().toLowerCase();
    const i = DAYS.indexOf(name);
    if (i < 0) continue;
    week[i] = parseDay(line);
    found++;
  }
  return found ? week : null;
}

function nowIn(tz: string | null): { day: number; min: number } {
  const d = new Date();
  if (!tz) return { day: d.getDay(), min: d.getHours() * 60 + d.getMinutes() };
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: DAYS.indexOf(get("weekday").toLowerCase()), min: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

const fmt = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

export interface HoursSummary {
  /** e.g. "Open now · closes 11 PM", "Closed · opens 8 AM", "Closed today" */
  label: string;
  /** true = open, false = closed, null = unknown (no time zone) */
  open: boolean | null;
  /** Index into the original list for "today", to highlight it. */
  todayIndex: number;
}

export function summarizeHours(lines: string[], tz: string | null): HoursSummary | null {
  const week = parseWeek(lines);
  if (!week) return null;
  const { day, min } = nowIn(tz);
  const todayIndex = lines.findIndex((l) => l.toLowerCase().startsWith(DAYS[day]));
  const today = week[day];
  const yesterday = week[(day + 6) % 7];
  if (!tz) {
    if (!today) return null;
    return { label: today.closed ? "Closed today" : today.allDay ? "Open 24 hours" : `Today ${today.ranges.map((r) => `${fmt(r.open)}–${fmt(r.close)}`).join(", ")}`, open: null, todayIndex };
  }
  if (today?.allDay) return { label: "Open 24 hours", open: true, todayIndex };
  // Still open from last night?
  for (const r of yesterday?.ranges ?? []) if (r.close > 1440 && min < r.close - 1440) return { label: `Open now · closes ${fmt(r.close)}`, open: true, todayIndex };
  for (const r of today?.ranges ?? []) {
    if (min >= r.open && min < r.close) return { label: `Open now · closes ${fmt(r.close)}`, open: true, todayIndex };
  }
  const later = (today?.ranges ?? []).find((r) => r.open > min);
  if (later) return { label: `Closed · opens ${fmt(later.open)}`, open: false, todayIndex };
  for (let i = 1; i <= 7; i++) {
    const d = week[(day + i) % 7];
    if (d?.allDay) return { label: `Closed · opens ${i === 1 ? "tomorrow" : cap(DAYS[(day + i) % 7])}`, open: false, todayIndex };
    if (d?.ranges.length) return { label: `Closed · opens ${i === 1 ? "tomorrow" : cap(DAYS[(day + i) % 7].slice(0, 3))} ${fmt(d.ranges[0].open)}`, open: false, todayIndex };
  }
  return { label: today?.closed ? "Closed today" : "Closed", open: false, todayIndex };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 24, p: P) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...p,
});

export const HomeIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
);
export const SearchIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const PlusIcon = ({ size, ...p }: P) => (
  <svg {...base(size, { strokeWidth: 2, ...p })}><path d="M12 5v14" /><path d="M5 12h14" /></svg>
);
export const BellIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
);
export const UserIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7" /></svg>
);
export const MicIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></svg>
);
export const StopIcon = ({ size, ...p }: P) => (
  <svg {...base(size, { fill: "currentColor", stroke: "none", ...p })}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);
export const PlayIcon = ({ size, ...p }: P) => (
  <svg {...base(size, { fill: "currentColor", stroke: "none", ...p })}><path d="M7 5.5v13l11-6.5z" /></svg>
);
export const PauseIcon = ({ size, ...p }: P) => (
  <svg {...base(size, { fill: "currentColor", stroke: "none", ...p })}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
);
export const SpeakerIcon = ({ size, ...p }: P) => (
  <svg {...base(size, { strokeWidth: 2, ...p })}><path d="M4 9v6h4l5 5V4L8 9H4z" /><path d="M16.5 8a5 5 0 0 1 0 8" /></svg>
);
export const MapIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14" /><path d="M15 6v14" /></svg>
);
export const ListIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>
);
export const ShareIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
);
export const ForkIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="6" cy="5" r="2.2" /><circle cx="18" cy="5" r="2.2" /><circle cx="12" cy="19" r="2.2" /><path d="M6 7.2v2.3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7.2" /><path d="M12 12.5v4.3" /></svg>
);
export const EditIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="m13.5 6.5 3 3" /></svg>
);
export const CheckIcon = ({ size, ...p }: P) => (
  <svg {...base(size, { strokeWidth: 2.2, ...p })}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const XIcon = ({ size, ...p }: P) => (
  <svg {...base(size, { strokeWidth: 2, ...p })}><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
);
export const ChevronLeft = ({ size, ...p }: P) => (
  <svg {...base(size, { strokeWidth: 2, ...p })}><path d="m15 5-7 7 7 7" /></svg>
);
export const ChevronUp = ({ size, ...p }: P) => (
  <svg {...base(size, { strokeWidth: 2, ...p })}><path d="m6 15 6-6 6 6" /></svg>
);
export const ChevronDown = ({ size, ...p }: P) => (
  <svg {...base(size, { strokeWidth: 2, ...p })}><path d="m6 9 6 6 6-6" /></svg>
);
export const TrashIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></svg>
);
export const LinkIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
);
export const CameraIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
export const SparkleIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" /><path d="M12 8a4 4 0 0 0 4 4 4 4 0 0 0-4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4z" /></svg>
);
export const PinIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12z" /><circle cx="12" cy="9" r="2.6" /></svg>
);
export const ClockIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
export const LockIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
export const GlobeIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18" /><path d="M12 3a14 14 0 0 0 0 18" /></svg>
);
export const KeyboardIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></svg>
);
export const AlertIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M12 3 2.5 20h19z" /><path d="M12 9v5" /><path d="M12 17h.01" /></svg>
);
export const ChatIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M4 5h16v11H8l-4 4V5z" /></svg>
);

/* Category glyphs used on place tiles (white strokes on a gradient). */
export const CategoryGlyph = ({ name, size = 26 }: { name: string; size?: number }) => {
  const p = base(size, { strokeWidth: 1.5, stroke: "white" });
  switch (name) {
    case "Food & Drinks":
      return <svg {...p}><path d="M7 2v9a2 2 0 0 1-4 0V2" /><path d="M5 11v11" /><path d="M17 2c-1.4 1.8-2 3.6-2 6.5 0 1.8.9 2.5 2 2.5s2-.7 2-2.5c0-2.9-.6-4.7-2-6.5z" /><path d="M17 11v11" /></svg>;
    case "Nightlife":
      return <svg {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /><path d="M16 3v3M17.5 4.5h-3" /></svg>;
    case "Scenic Spots":
      return <svg {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
    case "Entertainment":
      return <svg {...p}><path d="M3 8a2 2 0 0 0 0 4v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4a2 2 0 0 1 0-4V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" /><path d="M14 5v12" strokeDasharray="2 2" /></svg>;
    case "Sports & Wellness":
      return <svg {...p}><path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14z" /><path d="M5 19c3-3 6-6 10-9" /></svg>;
    case "Spiritual":
      return <svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>;
    case "Shopping":
      return <svg {...p}><path d="M5 8h14l-1 13H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>;
    case "Nature":
      return <svg {...p}><path d="M12 3 6 11h3l-4 6h5v4h4v-4h5l-4-6h3z" /></svg>;
    case "Stay":
      return <svg {...p}><path d="M3 18V8" /><path d="M3 13h18v5" /><path d="M7 13V9h5v4" /><circle cx="6.5" cy="10" r="1" /></svg>;
    default:
      return <svg {...p}><path d="M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12z" /></svg>;
  }
};
export const EyeIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const EyeOffIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M3 3l18 18" /><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.9 9.9 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
);
export const HeartIcon = ({ size, filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base(size, p)} fill={filled ? "currentColor" : "none"}><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.5 7.8 3.6 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.5 3.3 4.3 6.6-1.8 4.8-9.3 9.4-9.3 9.4Z" /></svg>
);
export const ChevronRight = ({ size, ...p }: P) => (
  <svg {...base(size, { strokeWidth: 2, ...p })}><path d="m9 5 7 7-7 7" /></svg>
);
export const LocateIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7.5" /></svg>
);
export const InstagramIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" /></svg>
);
export const WhatsAppIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1a4 4 0 0 1-2-2l1-1-1-2z" /></svg>
);
export const CalendarIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
export const PhoneIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2C10.5 21 3 13.5 3 6a2 2 0 0 1 2-2z" /></svg>
);

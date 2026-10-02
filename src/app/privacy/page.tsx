import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice" updated="2 October 2026">
      <p>What MyGuide collects, why, and what you can do about it.</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account:</b> your name, username, email and a securely hashed password. Optional bio, photo, Instagram and website.</li>
        <li><b>What you create:</b> guides, places, notes, tips, photos, voice notes, comments, favourites, reactions and trips.</li>
        <li><b>Location — only when you ask:</b> &ldquo;Record a place&rdquo; and &ldquo;my location&rdquo; on the map use your position once to find nearby places. We don&apos;t track you in the background or store your location history.</li>
        <li><b>Usage:</b> simple counts such as guide views, shares, saves and taps on directions, so creators can see how their guides are used and we can improve the app. Signed-out visitors get an anonymous browser id.</li>
        <li><b>Phone alerts:</b> if you turn them on, a technical address for your device so we can send notifications.</li>
      </ul>

      <h2>Who we share it with</h2>
      <ul>
        <li>Other people see what you make public or share with them, plus your profile.</li>
        <li>Services that run the app: hosting (Vercel), database (Turso), maps and place details (Google Maps), cover photos (Unsplash), and — when enabled — AI help for tidying notes and search (Anthropic). They process data only to provide those services.</li>
        <li>We don&apos;t sell your data or show ads.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>Make your account private so only approved followers see your guides.</li>
        <li>Keep any guide private and share it with specific people.</li>
        <li>Block or report anyone.</li>
        <li>Delete your account from Settings: your guides, places, comments, favourites and photos are removed. Copies other people made of your public guides stay with them, without your name.</li>
      </ul>

      <h2>Contact</h2>
      <p>Questions or requests: <Link href="/feedback" className="text-terracotta font-medium">Send feedback</Link>. See also the <Link href="/terms" className="text-terracotta font-medium">Terms of use</Link>.</p>
    </LegalPage>
  );
}

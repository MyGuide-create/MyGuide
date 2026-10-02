import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="2 October 2026">
      <p>MyGuide is in an early pilot with friends and family. These terms explain the basics in plain language. By creating an account you agree to them.</p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your password to yourself. You&apos;re responsible for what happens on your account.</li>
        <li>You can delete your account at any time from the You tab → Settings.</li>
      </ul>

      <h2>What you post</h2>
      <ul>
        <li>Your guides, notes, tips, photos, voice notes and comments stay yours. You let MyGuide store and show them to the people you choose (public, or only those you share with).</li>
        <li>If you make a guide public, others can read it, favourite places and — unless you turn it off — make their own copy with credit to you.</li>
        <li>Only upload photos you took or have the right to share.</li>
        <li>Be honest and kind: no spam, hate, harassment, or anything illegal. We may remove content or accounts that break this.</li>
      </ul>

      <h2>Recommendations, not guarantees</h2>
      <p>Guides are personal opinions. Opening hours, prices and details come partly from Google Maps and can be out of date — check before you go. MyGuide isn&apos;t responsible for your experience at a place.</p>

      <h2>The pilot</h2>
      <p>Features may change, break or be removed while we test. We&apos;ll try to keep your content safe, but please don&apos;t rely on MyGuide as the only copy of anything important.</p>

      <h2>Questions</h2>
      <p>Use <Link href="/feedback" className="text-terracotta font-medium">Send feedback</Link> in the app. See also our <Link href="/privacy" className="text-terracotta font-medium">Privacy notice</Link>.</p>
    </LegalPage>
  );
}

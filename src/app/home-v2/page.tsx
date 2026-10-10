import { redirect } from "next/navigation";

/** The preview became the real Home; old links land there. */
export default function HomeV2Redirect() {
  redirect("/");
}

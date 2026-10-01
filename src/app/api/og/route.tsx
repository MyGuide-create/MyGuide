import { ImageResponse } from "next/og";

/** Fallback link-preview card for guides that use the auto-generated cover. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const title = (params.get("title") || "MyGuide").slice(0, 90);
  const sub = (params.get("sub") || "Guides from people whose taste you trust.").slice(0, 120);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#fbf4ea", padding: "64px 72px", color: "#2a211c" }}>
        <div style={{ display: "flex", fontSize: 40 }}>
          <span>My</span>
          <span style={{ color: "#bd6f49" }}>Guide</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: -1 }}>{title}</div>
          <div style={{ marginTop: 24, fontSize: 32, color: "#7a6a5f" }}>{sub}</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ width: 120, height: 10, borderRadius: 5, background: "#bd6f49" }} />
          <div style={{ width: 60, height: 10, borderRadius: 5, background: "#8fa98a" }} />
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}

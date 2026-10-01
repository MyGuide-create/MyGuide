import { ConnectionsView } from "@/components/ConnectionsView";

export const dynamic = "force-dynamic";

export default async function FollowersPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <ConnectionsView username={username} kind="followers" />;
}

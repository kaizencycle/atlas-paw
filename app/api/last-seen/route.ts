import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadLastSeen } from "@/lib/atlas-gateway-state";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const lastSeen = await loadLastSeen();
  return NextResponse.json({ lastSeen });
}

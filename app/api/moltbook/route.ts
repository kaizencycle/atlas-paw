import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMe, getPosts, getPost } from "@/lib/moltbook";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = req.nextUrl.searchParams.get("action");

  try {
    switch (action) {
      case "me": {
        const data = await getMe();
        return NextResponse.json(data);
      }
      case "posts": {
        const sort = req.nextUrl.searchParams.get("sort") || "new";
        const limit = Number(req.nextUrl.searchParams.get("limit") || "15");
        const data = await getPosts(sort, limit);
        return NextResponse.json(data);
      }
      case "post": {
        const id = req.nextUrl.searchParams.get("id");
        if (!id)
          return NextResponse.json({ error: "Missing id" }, { status: 400 });
        const data = await getPost(id);
        return NextResponse.json(data);
      }
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

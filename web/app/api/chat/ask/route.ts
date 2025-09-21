// web/app/api/chat/ask/route.ts
import { NextRequest, NextResponse } from "next/server";

const BACKEND = (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

export async function POST(req: NextRequest) {
  const body = await req.text();
  const r = await fetch(`${BACKEND}/chat/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const text = await r.text();
  if (!r.ok) {
    return new NextResponse(text || "Upstream error", { status: r.status });
  }
  return new NextResponse(text, { status: 200, headers: { "Content-Type": "application/json" } });
}

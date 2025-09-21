import { NextRequest, NextResponse } from "next/server";
const API = (process.env.NEXT_PUBLIC_API || process.env.BACKEND_URL || "http://localhost:8081").replace(/\/$/, "");

export async function POST(req: NextRequest) {
  const { ttl_hours = 48 } = await req.json().catch(() => ({}));
  const r = await fetch(`${API}/jobs/cleanup?ttl_hours=${ttl_hours}`, { method: "DELETE" });
  const text = await r.text();
  return new NextResponse(text || "{}", { status: r.status, headers: { "content-type": "application/json" } });
}

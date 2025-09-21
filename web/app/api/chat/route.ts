// web/app/api/chat/route.ts
import { NextResponse } from "next/server";

const API = process.env.NEXT_PUBLIC_API!; // e.g. http://localhost:8081

type Body = {
  job_id: string;
  resume_text: string;
  question: string;
  history?: { role: "user" | "assistant"; content: string }[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    if (!body.job_id || !body.resume_text || !body.question) {
      return NextResponse.json(
        { error: "job_id, resume_text, question are required" },
        { status: 400 }
      );
    }

    // forward to backend which already has GROQ_API_KEY loaded
    const r = await fetch(`${API}/chat/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          ...(body.history ?? []),
          {
            role: "user",
            content: [
              `JOB_ID: ${body.job_id}`,
              `RESUME:\n${body.resume_text}`,
              `QUESTION: ${body.question}`,
            ].join("\n\n"),
          },
        ],
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return NextResponse.json(
        { error: `Backend error: ${r.status} ${errText}` },
        { status: 502 }
      );
    }

    const data = await r.json();
    // backend returns { text: string }
    return NextResponse.json({ answer: data.text ?? "(no answer)" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

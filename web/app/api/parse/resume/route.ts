import { NextResponse } from "next/server";

/** POST /api/parse/resume */
export async function POST(req: Request) {
  try {
    const upstream =
      (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    // If we have an upstream parser, proxy to it.
    if (upstream) {
      const fd = new FormData();
      fd.append("file", file, file.name || "resume");
      const res = await fetch(`${upstream}/parse/resume`, { method: "POST", body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return NextResponse.json(
          { error: `Upstream parse failed: ${res.status} ${text}` },
          { status: 502 },
        );
      }
      const data = await res.json();
      // If upstream returns plain text, normalize it before sending to the client
      const text: string = typeof data?.text === "string" ? data.text : "";
      const clean = reconstructResumeText(text);
      return NextResponse.json({ text: clean, chars: clean.length }, { status: 200 });
    }

    // Local fallback
    const mime = (file.type || "").toLowerCase();

    if (mime.startsWith("text/") || mime === "application/json") {
      const raw = await file.text();
      const clean = reconstructResumeText(raw);
      return NextResponse.json({ text: clean, chars: clean.length }, { status: 200 });
    }

    // No pdf parsing locally unless you wire pdf-parse (see comment)
    return NextResponse.json(
      {
        error:
          "PDF parsing backend is not configured. Set BACKEND_URL (or NEXT_PUBLIC_BACKEND_URL) to your parser service.",
        hint:
          "Dev tip: add BACKEND_URL=http://localhost:8081 to web/.env.local and run your parser; or install pdf-parse and parse locally, then pass through reconstructResumeText().",
      },
      { status: 501 },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

/** Heuristic cleanup to undo OCR/PDF 'one word per line' and keep bullets/headings. */
function reconstructResumeText(input: string): string {
  const normalized = input.normalize("NFKC");

  // Unwrap soft-hyphenated line breaks like: "infrastructur-\ne"
  const dehyphenated = normalized.replace(/([A-Za-z])-\n(?=[A-Za-z])/g, "$1");

  // Split on lines, trim trailing spaces
  const lines = dehyphenated
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/g, ""));

  const bullets = /^(\s*[-*•‣▪◦]|(\s*\d+[\.)]))\s+/;
  const hardBreakAfter = /[:;]\s*$|^\s*[-*•‣▪◦]|\)\s*$/;
  const sentenceEnd = /[.!?]["')\]]?\s*$/;

  const out: string[] = [];
  let buf = "";

  const flush = () => {
    const s = buf.trim();
    if (s) out.push(s);
    buf = "";
  };

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i].trim();
    const next = (lines[i + 1] || "").trim();

    // empty line -> paragraph break
    if (!cur) {
      flush();
      continue;
    }

    // Keep bullets/headings as their own lines
    if (bullets.test(cur)) {
      flush();
      out.push(cur);
      continue;
    }

    // Decide whether to join with next line or keep a hard break
    const joinSoftly =
      cur.length > 0 &&
      !sentenceEnd.test(cur) &&
      !hardBreakAfter.test(cur) &&
      next &&
      !bullets.test(next);

    if (joinSoftly) {
      // Join with a space
      buf += (buf ? " " : "") + cur;
    } else {
      buf += (buf ? " " : "") + cur;
      flush();
    }
  }
  flush();

  // Collapse triple newlines, tidy spaces
  return out
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

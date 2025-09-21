// web/lib/api.ts

// ========== Types ==========
export type Job = {
  id: string;
  source?: string;
  company: string;
  title: string;
  location?: string | null;
  remote?: string | null;
  employment_type?: string | null;
  level?: string | null;
  posted_at?: string | null;
  apply_url: string;
  canonical_url?: string | null;
  currency?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_period?: string | null;
  description_md: string;
  description_raw?: string | null;
  created_at?: string | null;
};

export type AnalysisResult = {
  fit_score: number;
  strengths: string[];
  gaps: string[];
  ats_keywords: string[];
  rationale: string;
};

export type CoverLetterResult = { letter_md: string };

// Unified chat input (this is what JobChat uses)
export type ChatAskIn = {
  question: string;
  job_md: string;
  // accept either; we will map to resume_md for the backend
  resume_md?: string;
  resume_text?: string;
};
// Back-compat chat input (some older callers may pass `resume_md`)
export type ChatAskInLegacy = {
  question: string;
  job_md: string;
  /** Legacy name — we will normalize to resume_text */
  resume_md: string;
};

// Superset of possible backend chat fields (different backends return different shapes)
export type ChatAskOut = {
  answer?: string;
  content?: string;
  message?: string;
  score?: number;
};



// ========== Bases & helpers ==========
const API = process.env.NEXT_PUBLIC_API!;
if (!API) console.warn("NEXT_PUBLIC_API is not set (put it in web/.env.local)");

// Prefer a direct backend for LLM/parse endpoints if provided; otherwise expect a Next.js /api proxy.

const PUBLIC_BACKEND = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
const BASE = PUBLIC_BACKEND || "/api";

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${body ? ` - ${body}` : ""}`);
  }
  return (await res.json()) as T;
}

async function fetchJson(input: RequestInfo | URL, init?: RequestInit) {
  const res = await fetch(input, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} - ${await res.text()}`);
  return res.json();
}

// ========== Jobs ==========
export async function searchJobs(body: Record<string, any> = {}): Promise<Job[]> {
  const res = await fetch(`${API}/jobs/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return asJson<Job[]>(res);
}

export async function recentJobs(limit = 20): Promise<Job[]> {
  return searchJobs({ limit, offset: 0 });
}

export async function getJob(id: string): Promise<Job> {
  const res = await fetch(`${API}/jobs/${id}`, { cache: "no-store" });
  return asJson<Job>(res);
}

// ========== LLM features via backend (if available) ==========
export async function analyzeFit(job_id: string, resume_text: string): Promise<AnalysisResult> {
  const res = await fetch(`${API}/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ job_id, resume_text }),
  });
  return asJson<AnalysisResult>(res);
}

export async function generateCoverLetter(
  job_id: string,
  resume_text: string,
  variant: "short" | "standard" | "long" = "standard",
  tone?: string,
): Promise<CoverLetterResult> {
  const res = await fetch(`${API}/cover_letters`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ job_id, resume_text, variant, tone }),
  });
  return asJson<CoverLetterResult>(res);
}

// ========== First-class Chat via Next route (/api/chat) ==========
export async function askJobLLM(payload: {
  job_id: string;
  resume_text: string;
  question: string;
  history?: { role: "user" | "assistant"; content: string }[];
}): Promise<{ answer: string }> {
  const res = await fetch(`/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return asJson<{ answer: string }>(res);
}

// ========== Direct Chat to backend (/chat/ask) ==========
// Legacy function kept for compatibility. It normalizes its input and delegates to `chatAsk`.
export async function postChatAsk(body: ChatAskIn | ChatAskInLegacy): Promise<ChatAskOut> {
  // Normalize legacy `resume_md` -> `resume_text`
  const normalized: ChatAskIn =
    "resume_md" in body
      ? { question: body.question, job_md: body.job_md, resume_text: body.resume_md }
      : body;

  return chatAsk(normalized);
}

// Canonical chat function used by JobChat
export async function chatAsk(payload: ChatAskIn): Promise<ChatAskOut> {
  const { question, job_md } = payload;
  const resume_md = payload.resume_md ?? payload.resume_text ?? ""; // <— key fix
  return fetchJson(`${BASE}/chat/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, job_md, resume_md }),
  });
}
// ========== Resume parsing (single definition) ==========
export async function parseResume(file: File): Promise<{ text: string; chars: number }> {
  const fd = new FormData();
  // include filename for better parsers
  fd.append("file", file, file.name);

  return fetchJson<{ text: string; chars: number }>(`${BASE}/parse/resume`, {
    method: "POST",
    body: fd,
  });
}

// // web/lib/api.ts
// export type Job = {
//   id: string;
//   source?: string;
//   company: string;
//   title: string;
//   location?: string | null;
//   remote?: string | null;
//   employment_type?: string | null;
//   level?: string | null;
//   posted_at?: string | null;
//   apply_url: string;
//   canonical_url?: string | null;
//   currency?: string | null;
//   salary_min?: number | null;
//   salary_max?: number | null;
//   salary_period?: string | null;
//   description_md: string;
//   description_raw?: string | null;
//   created_at?: string | null;
// };

// export type AnalysisResult = {
//   fit_score: number;
//   strengths: string[];
//   gaps: string[];
//   ats_keywords: string[];
//   rationale: string;
// };

// export type CoverLetterResult = { letter_md: string };

// const API = process.env.NEXT_PUBLIC_API!;
// if (!API) console.warn("NEXT_PUBLIC_API is not set (put it in web/.env.local)");

// async function asJson<T>(res: Response): Promise<T> {
//   if (!res.ok) {
//     const body = await res.text().catch(() => "");
//     throw new Error(`${res.status} ${res.statusText}${body ? ` - ${body}` : ""}`);
//   }
//   return (await res.json()) as T;
// }

// // ---- Jobs ----
// export async function searchJobs(body: Record<string, any> = {}): Promise<Job[]> {
//   const res = await fetch(`${API}/jobs/search`, {
//     method: "POST",
//     headers: { "content-type": "application/json" },
//     body: JSON.stringify(body),
//     cache: "no-store",
//   });
//   return asJson<Job[]>(res);
// }

// export async function recentJobs(limit = 20): Promise<Job[]> {
//   return searchJobs({ limit, offset: 0 });
// }

// export async function getJob(id: string): Promise<Job> {
//   const res = await fetch(`${API}/jobs/${id}`, { cache: "no-store" });
//   return asJson<Job>(res);
// }

// // ---- LLM features via backend (if available) ----
// // Keeping these in case your backend implements them.
// // If your backend returns 404, you can ignore these and just use chat below.
// export async function analyzeFit(job_id: string, resume_text: string): Promise<AnalysisResult> {
//   const res = await fetch(`${API}/analyze`, {
//     method: "POST",
//     headers: { "content-type": "application/json" },
//     body: JSON.stringify({ job_id, resume_text }),
//   });
//   return asJson<AnalysisResult>(res);
// }

// export async function generateCoverLetter(
//   job_id: string,
//   resume_text: string,
//   variant: "short" | "standard" | "long" = "standard",
//   tone?: string,
// ): Promise<CoverLetterResult> {
//   const res = await fetch(`${API}/cover_letters`, {
//     method: "POST",
//     headers: { "content-type": "application/json" },
//     body: JSON.stringify({ job_id, resume_text, variant, tone }),
//   });
//   return asJson<CoverLetterResult>(res);
// }

// // ---- First-class Chat (always works) ----
// export async function askJobLLM(payload: {
//   job_id: string;
//   resume_text: string;
//   question: string;
//   history?: { role: "user" | "assistant"; content: string }[];
// }): Promise<{ answer: string }> {
//   const res = await fetch(`/api/chat`, {
//     method: "POST",
//     headers: { "content-type": "application/json" },
//     body: JSON.stringify(payload),
//   });
//   return asJson<{ answer: string }>(res);
// }

// // web/lib/api.ts
// export type ChatAskIn = {
//   job_md: string;
//   resume_md: string;
//   question: string;
// };

// export type ChatAskOut = {
//   answer: string;
//   score: number;
//   matches: string[];
//   gaps: string[];
//   suggestions: string[];
// };

// export async function postChatAsk(body: ChatAskIn): Promise<ChatAskOut> {
//   const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8081"}/chat/ask`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(body),
//   });
//   if (!res.ok) {
//     const text = await res.text().catch(() => "");
//     throw new Error(`Backend error: ${res.status} ${text}`);
//   }
//   return (await res.json()) as ChatAskOut;
// }

// // web/lib/api.ts (add this near other helpers)
// export async function parseResume(file: File): Promise<{ text: string; chars: number }> {
//   const base = process.env.NEXT_PUBLIC_BACKEND_URL || "";
//   const fd = new FormData();
//   fd.append("file", file, file.name);
//   const res = await fetch(`${base}/parse/resume`, {
//     method: "POST",
//     body: fd,
//   });
//   if (!res.ok) {
//     throw new Error(`Parse failed: ${res.status} ${await res.text()}`);
//   }
//   return res.json();
// }

// // web/lib/api.ts

// export type ChatAskIn = {
//   question: string;
//   job_md: string;
//   resume_text: string;
// };
// export type ChatAskOut = {
//   answer?: string;
//   content?: string;
//   message?: string;
//   score?: number;
// };

// // Prefer server route handlers at /api/*, but allow direct backend when provided
// const PUBLIC_BACKEND = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
// const BASE = PUBLIC_BACKEND || "/api"; // if no env, use Next's /api proxy we add below

// async function fetchJson(input: RequestInfo | URL, init?: RequestInit) {
//   const res = await fetch(input, init);
//   if (!res.ok) throw new Error(`${res.status} ${res.statusText} - ${await res.text()}`);
//   return res.json();
// }

// export async function chatAsk(payload: ChatAskIn): Promise<ChatAskOut> {
//   return fetchJson(`${BASE}/chat/ask`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(payload),
//   });
// }

// export async function parseResume(file: File): Promise<{ text: string; chars: number }> {
//   const fd = new FormData();
//   fd.append("file", file);
//   return fetchJson(`${BASE}/parse/resume`, { method: "POST", body: fd });
// }

// // // web/lib/api.ts (single copy)

// // export type Job = {
// //   id: string;
// //   source?: string;
// //   company: string;
// //   title: string;
// //   location?: string | null;
// //   remote?: string | null;
// //   employment_type?: string | null;
// //   level?: string | null;
// //   posted_at?: string | null;
// //   apply_url: string;
// //   canonical_url?: string | null;
// //   currency?: string | null;
// //   salary_min?: number | null;
// //   salary_max?: number | null;
// //   salary_period?: string | null;
// //   description_md: string;
// //   description_raw?: string | null;
// //   created_at?: string | null;
// // };

// // export type AnalysisResult = {
// //   fit_score: number;
// //   strengths: string[];
// //   gaps: string[];
// //   ats_keywords: string[];
// //   rationale: string;
// // };

// // export type CoverLetterResult = { letter_md: string };

// // // prefer NEXT_PUBLIC_API_URL; fall back to legacy NEXT_PUBLIC_API if present
// // export const API =
// //   process.env.NEXT_PUBLIC_API_URL ||
// //   process.env.NEXT_PUBLIC_API ||
// //   "http://127.0.0.1:8081";

// // if (!process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API) {
// //   // not fatal, but useful in dev
// //   // eslint-disable-next-line no-console
// //   console.warn("NEXT_PUBLIC_API_URL is not set (using http://127.0.0.1:8081)");
// // }

// // async function asJson<T>(res: Response): Promise<T> {
// //   if (!res.ok) {
// //     const body = await res.text().catch(() => "");
// //     throw new Error(`${res.status} ${res.statusText}${body ? ` - ${body}` : ""}`);
// //   }
// //   return (await res.json()) as T;
// // }

// // // ---------- Jobs ----------
// // export async function searchJobs(body: Record<string, any> = {}): Promise<Job[]> {
// //   const res = await fetch(`${API}/jobs/search`, {
// //     method: "POST",
// //     headers: { "content-type": "application/json" },
// //     body: JSON.stringify(body),
// //     cache: "no-store",
// //   });
// //   return asJson<Job[]>(res);
// // }

// // // “Recent” = search with no filters (backend does not expose /jobs/recent)
// // export async function recentJobs(limit = 20): Promise<Job[]> {
// //   return searchJobs({ limit, offset: 0 });
// // }

// // export async function getJob(id: string): Promise<Job> {
// //   const res = await fetch(`${API}/jobs/${id}`, { cache: "no-store" });
// //   return asJson<Job>(res);
// // }

// // // ---------- LLM features (match your FastAPI routes) ----------
// // export async function analyzeFit(job_id: string, resume_md: string): Promise<AnalysisResult> {
// //   const res = await fetch(`${API}/analyze/fit`, {
// //     method: "POST",
// //     headers: { "content-type": "application/json" },
// //     body: JSON.stringify({ job_id, resume_md }),
// //   });
// //   return asJson<AnalysisResult>(res);
// // }

// // export async function generateCoverLetter(
// //   job_id: string,
// //   resume_md: string,
// //   variant: "short" | "standard" | "long" = "standard",
// //   tone?: string
// // ): Promise<CoverLetterResult> {
// //   const res = await fetch(`${API}/cover-letters/generate`, {
// //     method: "POST",
// //     headers: { "content-type": "application/json" },
// //     body: JSON.stringify({ job_id, resume_md, variant, tone }),
// //   });
// //   return asJson<CoverLetterResult>(res);
// // }

// // export async function askJobQA(payload: {
// //   job_id: string;
// //   question: string;
// //   resume_text?: string;
// // }): Promise<{ answer: string }> {
// //   const res = await fetch(`${process.env.NEXT_PUBLIC_API}/qa`, {
// //     method: "POST",
// //     headers: { "content-type": "application/json" },
// //     body: JSON.stringify(payload),
// //   });
// //   if (!res.ok) throw new Error(await res.text());
// //   return res.json();
// // }

// // // web/lib/api.ts – add at bottom
// // export async function askJobChat(payload: {
// //   job_id: string;
// //   resume_text: string;
// //   question: string;
// // }): Promise<{ answer: string }> {
// //   const res = await fetch(`${API}/chat`, {
// //     method: "POST",
// //     headers: { "content-type": "application/json" },
// //     body: JSON.stringify(payload),
// //   });
// //   if (!res.ok) {
// //     const body = await res.text().catch(() => "");
// //     throw new Error(`${res.status} ${res.statusText}${body ? ` - ${body}` : ""}`);
// //   }
// //   return res.json();
// // }




// // export type ChatTurn = { role: "system" | "user" | "assistant"; content: string };


// // if (!API) console.warn("NEXT_PUBLIC_API is not set (put it in web/.env.local)");








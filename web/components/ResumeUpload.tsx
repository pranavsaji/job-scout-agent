// web/components/ResumeUpload.tsx
"use client";

import { useRef, useState } from "react";
import { Group, Button, Text, Textarea, FileButton, Alert } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { parseResume } from "@/lib/api";

type Props = {
  onText: (t: string) => void;
  onParsed?: () => void;
  onOpenChat?: () => void;
  onReadyChange?: (ready: boolean) => void;
};

export default function ResumeUpload({ onText, onParsed, onOpenChat, onReadyChange }: Props) {
  const [fileName, setFileName] = useState<string>("");
  const [raw, setRaw] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  async function handleFile(f: File | null) {
    if (!f) return;
    setError(null);
    setBusy(true);
    setFileName(f.name);
    try {
      const { text } = await parseResume(f);
      setRaw(text);
      onText(text);
      onParsed?.();
      onReadyChange?.(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to parse resume.");
      onReadyChange?.(false);
    } finally {
      setBusy(false);
    }
  }

  function handleRawChange(v: string) {
    setRaw(v);
    onText(v);
    onReadyChange?.(!!v.trim());
  }

  return (
    <div className="space-y-2">
      <Text fw={600}>Your resume</Text>
      <Group gap="sm" wrap="wrap">
        <FileButton onChange={handleFile} accept=".pdf,.docx,.txt">
          {(props) => (
            <Button {...props} loading={busy}>
              Upload resume (PDF, DOCX, or TXT)
            </Button>
          )}
        </FileButton>
        {fileName && <Text size="sm" c="dimmed">{fileName}</Text>}
        <Button variant="subtle" onClick={onOpenChat} disabled={!raw.trim()}>
          Open chat
        </Button>
      </Group>

      {error && (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {error}
        </Alert>
      )}

      <Textarea
        ref={taRef}
        label="Raw text (editable)"
        description="We convert your file to clean English text."
        autosize
        minRows={8}
        maxRows={20}
        value={raw}
        onChange={(e) => handleRawChange(e.currentTarget.value)}
      />
    </div>
  );
}

// // web/components/ResumeUpload.tsx
// "use client";

// import { useEffect, useMemo, useRef, useState } from "react";
// import { FileInput, Textarea, Text, Badge, Tabs, Card, ScrollArea, Alert } from "@mantine/core";

// type Props = {
//   onText: (t: string) => void;
//   onParsed?: (t: string) => void;
//   onOpenChat?: () => void;
//   onReadyChange?: (ready: boolean) => void;
//   disabled?: boolean;
// };

// type Preview = { kind: "html" | "text" | "pdf"; value: string };

// export default function ResumeUpload({
//   onText,
//   onParsed,
//   onOpenChat,
//   onReadyChange,
//   disabled = false,
// }: Props) {
//   const [file, setFile] = useState<File | null>(null);
//   const [resumeText, setResumeText] = useState("");
//   const [info, setInfo] = useState<string>("");
//   const [preview, setPreview] = useState<Preview | null>(null);
//   const objectUrlRef = useRef<string | null>(null);

//   useEffect(() => {
//     onText(resumeText);
//   }, [resumeText, onText]);

//   useEffect(() => {
//     onReadyChange?.(!!file || resumeText.trim().length > 0);
//   }, [file, resumeText, onReadyChange]);

//   useEffect(() => {
//     return () => {
//       if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
//     };
//   }, []);

//   async function parsePdfToText(pdfFile: File): Promise<string> {
//     // Robust pdf.js parse with explicit worker path
//     const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
//     (pdfjs as any).GlobalWorkerOptions.workerSrc = new URL(
//       "pdfjs-dist/build/pdf.worker.mjs",
//       import.meta.url,
//     ).toString();

//     const data = await pdfFile.arrayBuffer();
//     const doc = await (pdfjs as any).getDocument({
//       data,
//       isEvalSupported: false,
//       disableFontFace: true,
//       useWorkerFetch: false,
//     }).promise;

//     const lines: string[] = [];
//     for (let i = 1; i <= doc.numPages; i++) {
//       const page = await doc.getPage(i);
//       const content = await page.getTextContent();
//       const spans = (content.items as any[])
//         .map((it) => {
//           const t = it.transform as number[] | undefined;
//           const x = typeof t?.[4] === "number" ? t![4] : 0;
//           const y = typeof t?.[5] === "number" ? t![5] : 0;
//           return { str: String(it.str ?? ""), x, y };
//         })
//         .filter((s) => s.str && /[^\s]/.test(s.str));
//       // group by y to rebuild lines
//       const tol = 2;
//       const buckets: { y: number; items: { str: string; x: number }[] }[] = [];
//       for (const s of spans) {
//         let b = buckets.find((bb) => Math.abs(bb.y - s.y) <= tol);
//         if (!b) buckets.push((b = { y: s.y, items: [] }));
//         b.items.push({ str: s.str, x: s.x });
//       }
//       buckets.sort((a, b) => b.y - a.y);
//       for (const b of buckets) {
//         b.items.sort((a, c) => a.x - c.x);
//         const line = b.items.map((i) => i.str).join(" ");
//         const norm = normalize(line);
//         if (norm) lines.push(norm);
//       }
//       await page.cleanup?.();
//     }
//     await doc.destroy?.();
//     return postProcess(lines);
//   }

//   async function parseDocxToText(docxFile: File): Promise<{ text: string; html: string }> {
//     const mammoth = (await import("mammoth/mammoth.browser")) as any;
//     const arrayBuffer = await docxFile.arrayBuffer();
//     const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
//     const text = htmlToPlain(html);
//     return { text, html };
//   }

//   async function handleFileSelect(f: File | null) {
//     setFile(f);
//     setResumeText("");
//     setInfo("");
//     setPreview(null);
//     onReadyChange?.(!!f);
//     if (objectUrlRef.current) {
//       URL.revokeObjectURL(objectUrlRef.current);
//       objectUrlRef.current = null;
//     }
//     if (!f) return;

//     try {
//       const name = f.name.toLowerCase();
//       let text = "";
//       if (name.endsWith(".pdf") || f.type === "application/pdf") {
//         // Show actual PDF viewer
//         const url = URL.createObjectURL(f);
//         objectUrlRef.current = url;
//         setPreview({ kind: "pdf", value: url });

//         // Extract readable text for LLM using pdf.js
//         try {
//           text = await parsePdfToText(f);
//         } catch (err: any) {
//           // still give user something editable
//           text = await f.text();
//           setInfo(`Parsed via fallback: ${err?.message ?? String(err)}`);
//         }
//       } else if (name.endsWith(".docx")) {
//         const { text: t, html } = await parseDocxToText(f);
//         text = t;
//         setPreview({ kind: "html", value: html });
//       } else {
//         text = cleanPlain(await f.text());
//         setPreview({ kind: "text", value: toHtmlParagraphs(text) });
//       }

//       setResumeText(text);
//       onParsed?.(text);
//       onOpenChat?.();
//       setInfo(`${f.name} • ${Math.round(f.size / 1024)} KB • ${text.length.toLocaleString()} chars`);
//     } catch (e: any) {
//       setInfo(`Unable to parse: ${e?.message ?? String(e)}`);
//     }
//   }

//   const previewNode = useMemo(() => {
//     if (!preview) {
//       return <Text c="dimmed" size="sm">Upload a file to see a formatted preview.</Text>;
//     }
//     if (preview.kind === "pdf") {
//       return (
//         <object data={preview.value} type="application/pdf" width="100%" height="540">
//           <iframe src={preview.value} width="100%" height="540" />
//         </object>
//       );
//     }
//     return <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: preview.value }} />;
//   }, [preview]);

//   return (
//     <div className="space-y-3">
//       <Text fw={600} size="sm">Your resume</Text>

//       <FileInput
//         disabled={disabled}
//         label="Upload resume (PDF, DOCX, or TXT)"
//         placeholder="Pick file"
//         value={file}
//         onChange={handleFileSelect}
//         clearable
//       />

//       {info && <Badge variant="light" size="sm">{info}</Badge>}

//       <Tabs defaultValue="preview" keepMounted={false}>
//         <Tabs.List>
//           <Tabs.Tab value="preview">Preview</Tabs.Tab>
//           <Tabs.Tab value="text">Raw text (editable)</Tabs.Tab>
//         </Tabs.List>

//         <Tabs.Panel value="preview" pt="xs">
//           <Card withBorder>
//             {preview?.kind === "pdf" && (
//               <Alert color="gray" mb="sm">
//                 You’re seeing the original PDF. The text below (in the next tab) is what the AI will read.
//               </Alert>
//             )}
//             <ScrollArea h={560} type="hover">
//               {previewNode}
//             </ScrollArea>
//           </Card>
//         </Tabs.Panel>

//         <Tabs.Panel value="text" pt="xs">
//           <Textarea
//             disabled={disabled}
//             description="We never upload files to the server — extraction runs locally in your browser."
//             autosize
//             minRows={10}
//             value={resumeText}
//             onChange={(e) => setResumeText(e.currentTarget.value)}
//             placeholder="Paste or edit your resume text…"
//           />
//         </Tabs.Panel>
//       </Tabs>
//     </div>
//   );
// }

// /* ---------- helpers ---------- */
// function normalize(s: string): string {
//   return s.replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
// }
// function postProcess(lines: string[]): string {
//   const out: string[] = [];
//   for (let i = 0; i < lines.length; i++) {
//     const cur = lines[i];
//     const prev = lines[i - 1] ?? "";
//     const bullet = /^([•\-–]\s+|\d+\.\s+)/.test(cur);
//     const newPara = bullet || (prev && prev.length > 90 && cur.length < 40);
//     if (newPara && out.length && out[out.length - 1] !== "") out.push("");
//     out.push(cur);
//   }
//   return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
// }
// function toHtmlParagraphs(text: string): string {
//   const esc = (s: string) =>
//     s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
//   return text
//     .split(/\n{2,}/)
//     .map((para) => {
//       if (/^([•\-–]|\d+\.)\s+/.test(para)) {
//         const items = para.split(/\n+/).map((ln) => `<li>${esc(ln.replace(/^([•\-–]|\d+\.)\s+/, ""))}</li>`).join("");
//         return `<ul>${items}</ul>`;
//       }
//       return `<p>${esc(para).replace(/\n/g, "<br/>")}</p>`;
//     })
//     .join("");
// }
// function htmlToPlain(html: string): string {
//   const tmp = document.createElement("div");
//   tmp.innerHTML = html;
//   tmp.querySelectorAll("li").forEach((li) => li.insertAdjacentText("afterbegin", "- "));
//   tmp.querySelectorAll("br").forEach((br) => (br.outerHTML = "\n"));
//   tmp.querySelectorAll("p").forEach((p) => (p.innerHTML = p.innerHTML + "\n\n"));
//   return (tmp.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
// }
// function cleanPlain(t: string): string {
//   return t.replace(/\r\n?/g, "\n").split("\n").map((ln) => ln.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
// }

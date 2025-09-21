// web/components/JobChat.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  Group,
  Stack,
  Text,
  Textarea,
  Button,
  Badge,
  ActionIcon,
  ScrollArea,
  Loader,
  Alert,
} from "@mantine/core";
import { IconSend, IconRobot, IconUser, IconAlertCircle } from "@tabler/icons-react";
import { chatAsk, type ChatAskIn } from "@/lib/api";

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  score?: number;
  ts: number;
};

type Props = {
  /** Raw JD markdown (or plain text) */
  jobMd: string;
  /** Resume text captured from the resume uploader */
  resumeMd: string;
  className?: string;
  /** Optional starter chips users can click */
  seed?: string[];
};

export default function JobChat({
  jobMd,
  resumeMd,
  className,
  seed = [
    "How is this candidate a fit? Give strengths and gaps.",
    "Score this candidate out of 100 and explain.",
    "Suggest ATS keywords to add to the resume.",
    "Draft a recruiter pitch in 3-4 sentences.",
  ],
}: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canSend = input.trim().length > 0 && !sending;

  // auto-scroll to bottom on new messages
  useEffect(() => {
    const el = viewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, sending]);

  // initial greeting
  useEffect(() => {
    setTurns((t) =>
      t.length
        ? t
        : [
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text:
                "Ask about this job. I’ll use the JD + your resume to answer and score your fit.",
              ts: Date.now(),
            },
          ],
    );
  }, []);

  const lastScore = useMemo(() => {
    const s = [...turns].reverse().find((t) => typeof t.score === "number")?.score;
    return typeof s === "number" ? Math.round(s) : undefined;
  }, [turns]);

  async function send(text?: string) {
    if (sending) return;
    const question = (text ?? input).trim();
    if (!question) return;

    setInput("");
    setTurns((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text: question, ts: Date.now() },
    ]);
    setSending(true);

    try {
      // Always include both contexts (resume + job)
      const payload: ChatAskIn = {
        question,
        job_md: jobMd ?? "",
        resume_text: resumeMd ?? "",
      };
      const res = await chatAsk(payload);

      const answer = res?.answer || res?.message || res?.content || "(no answer)";
      const score = typeof res?.score === "number" ? res.score : undefined;

      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: answer,
          score,
          ts: Date.now(),
        },
      ]);
    } catch (e: any) {
      // Clean up noisy HTML error pages (404, etc.)
      const raw = e?.message ?? "Unknown error.";
      const looksLikeHtml = /<!doctype html>|<html/i.test(raw);
      const msg = looksLikeHtml
        ? "Sorry—couldn’t reach the chat service (got an HTML error page). Check your API proxy/env and try again."
        : raw;

      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `Sorry—something went wrong calling the LLM.\n\n${msg}`,
          ts: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <Card
      shadow="sm"
      radius="lg"
      withBorder
      className={className}
      style={{
        maxWidth: 960,
        marginInline: "auto",
        padding: "1rem",
      }}
    >
      {/* Header */}
      <Group justify="space-between" mb="sm" wrap="nowrap" align="center">
        <Group gap="xs" wrap="nowrap">
          <Text fw={600} size="sm" style={{ letterSpacing: 0.2 }}>
            Ask about this job
          </Text>
          {typeof lastScore === "number" && (
            <Badge variant="light" radius="sm" title="Latest fit score">
              Fit score: {lastScore}
            </Badge>
          )}
        </Group>
        {sending && (
          <Group gap={6}>
            <Loader size="xs" />
            <Text size="xs" c="dimmed">
              thinking…
            </Text>
          </Group>
        )}
      </Group>

      {/* Gentle hint if resume is empty */}
      {!resumeMd?.trim() && (
        <Alert
          variant="light"
          color="yellow"
          mb="sm"
          icon={<IconAlertCircle size={16} />}
          title="No resume text yet"
        >
          Upload or paste your resume above so answers can be personalized and scored accurately.
        </Alert>
      )}

      {/* Quick prompt chips */}
      {seed?.length ? (
        <Group gap={8} wrap="wrap" mb="xs">
          {seed.map((s, i) => (
            <Badge
              key={i}
              variant="outline"
              radius="sm"
              className="cursor-pointer"
              onClick={() => void send(s)}
              styles={{ root: { paddingInline: 10, lineHeight: 1.6 } }}
            >
              {s}
            </Badge>
          ))}
        </Group>
      ) : null}

      {/* Messages */}
      <Card withBorder radius="lg" padding="sm" style={{ background: "var(--mantine-color-gray-0)" }}>
        <ScrollArea
          h={420}
          offsetScrollbars
          type="auto"
          viewportRef={viewportRef}
          styles={{ viewport: { padding: "0.5rem" } }}
        >
          <Stack gap="sm">
            {turns.map((t) => (
              <Bubble key={t.id} role={t.role} score={t.score} ts={t.ts}>
                {t.text}
              </Bubble>
            ))}
          </Stack>
        </ScrollArea>
      </Card>

      {/* Composer */}
      <Stack mt="sm" gap="xs">
        <Textarea
          autosize
          minRows={2}
          maxRows={6}
          placeholder="Ask about the job, interview prep, or how to tailor your resume… (Shift+Enter = newline)"
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          styles={{
            input: { lineHeight: 1.5 },
          }}
        />
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            I’ll use the current JD & your resume to answer.
          </Text>
          <Group gap="xs">
            <ActionIcon
              size="lg"
              radius="xl"
              variant="light"
              onClick={() => void send()}
              disabled={!canSend}
              aria-label="Send"
              title="Send"
            >
              <IconSend size={18} />
            </ActionIcon>
            <Button
              onClick={() => void send()}
              disabled={!canSend}
              leftSection={<IconSend size={16} />}
            >
              Send
            </Button>
          </Group>
        </Group>
      </Stack>
    </Card>
  );
}

function Bubble({
  role,
  children,
  score,
  ts,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
  score?: number;
  ts: number;
}) {
  const isUser = role === "user";
  return (
    <Group
      align="flex-start"
      justify={isUser ? "flex-end" : "flex-start"}
      wrap="nowrap"
      gap="xs"
      style={{ paddingInline: 4 }}
    >
      {!isUser && <AvatarIcon which="assistant" />}
      <Card
        withBorder
        radius="lg"
        padding="md"
        className="max-w-[85%]"
        style={{
          background: isUser ? "var(--mantine-color-blue-0)" : "white",
          borderColor: isUser ? "var(--mantine-color-blue-3)" : "var(--mantine-color-gray-3)",
          boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
        }}
      >
        <Stack gap={6}>
          <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
            {children}
          </Text>
          <Group gap="xs" wrap="nowrap">
            {typeof score === "number" && (
              <Badge size="xs" variant="light" title="Fit score from this reply">
                Fit {Math.round(score)}
              </Badge>
            )}
            <Text size="xs" c="dimmed">
              {new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </Group>
        </Stack>
      </Card>
      {isUser && <AvatarIcon which="user" />}
    </Group>
  );
}

function AvatarIcon({ which }: { which: "user" | "assistant" }) {
  const Icon = which === "user" ? IconUser : IconRobot;
  return (
    <ActionIcon variant="light" radius="xl" size="lg" aria-label={which} title={which}>
      <Icon size={18} />
    </ActionIcon>
  );
}



// // web/components/JobChat.tsx
// "use client";

// import { useEffect, useMemo, useRef, useState } from "react";
// import {
//   Card,
//   Group,
//   Stack,
//   Text,
//   Textarea,
//   Button,
//   Badge,
//   ActionIcon,
//   ScrollArea,
//   Loader,
//   Alert,
// } from "@mantine/core";
// import { IconSend, IconRobot, IconUser, IconAlertCircle } from "@tabler/icons-react";

// type Turn = {
//   id: string;
//   role: "user" | "assistant";
//   text: string;
//   score?: number;
//   ts: number;
// };

// type Props = {
//   jobMd: string;     // raw JD markdown
//   resumeMd: string;  // live resume text
//   className?: string;
// };

// export default function JobChat({ jobMd, resumeMd, className }: Props) {
//   const [turns, setTurns] = useState<Turn[]>([]);
//   const [input, setInput] = useState("");
//   const [sending, setSending] = useState(false);

//   const viewportRef = useRef<HTMLDivElement | null>(null);
//   const canSend = input.trim().length > 0 && !sending;

//   useEffect(() => {
//     const el = viewportRef.current;
//     if (el) el.scrollTop = el.scrollHeight;
//   }, [turns, sending]);

//   useEffect(() => {
//     setTurns((t) =>
//       t.length
//         ? t
//         : [
//             {
//               id: crypto.randomUUID(),
//               role: "assistant",
//               text:
//                 "Ask about this job. I’ll use the JD + your resume to answer and score your fit.",
//               ts: Date.now(),
//             },
//           ],
//     );
//   }, []);

//   async function send() {
//     if (!canSend) return;
//     const question = input.trim();
//     setInput("");

//     setTurns((prev) => [
//       ...prev,
//       { id: crypto.randomUUID(), role: "user", text: question, ts: Date.now() },
//     ]);
//     setSending(true);

//     try {
//       const res = await fetch("/chat/ask", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           question,
//           job_md: jobMd ?? "",
//           resume_md: resumeMd ?? "", // <— ALWAYS include resume
//         }),
//       });

//       if (!res.ok) {
//         const err = await res.text().catch(() => "");
//         throw new Error(`${res.status} ${res.statusText} - ${err}`);
//       }
//       const data = await res.json();

//       const answer: string =
//         data.answer || data.message || data.content || "(no answer)";
//       const score: number | undefined =
//         typeof data.score === "number" ? data.score : undefined;

//       setTurns((prev) => [
//         ...prev,
//         {
//           id: crypto.randomUUID(),
//           role: "assistant",
//           text: answer,
//           score,
//           ts: Date.now(),
//         },
//       ]);
//     } catch (e: any) {
//       setTurns((prev) => [
//         ...prev,
//         {
//           id: crypto.randomUUID(),
//           role: "assistant",
//           text:
//             "Sorry—something went wrong calling the LLM.\n\n" +
//             (e?.message ?? "Unknown error."),
//           ts: Date.now(),
//         },
//       ]);
//     } finally {
//       setSending(false);
//     }
//   }

//   function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
//     if (e.key === "Enter" && !e.shiftKey) {
//       e.preventDefault();
//       send();
//     }
//   }

//   return (
//     <Card shadow="sm" radius="lg" withBorder className={className} style={{ maxWidth: 900, marginInline: "auto" }}>
//       <Group justify="space-between" mb="xs">
//         <Group gap="xs">
//           <Text fw={600}>Ask about this job</Text>
//           {useMemo(() => {
//             const lastScore = [...turns]
//               .reverse()
//               .find((t) => typeof t.score === "number")?.score;
//             return typeof lastScore === "number" ? (
//               <Badge variant="light" radius="sm" title="Fit score">
//                 Fit score: {Math.round(lastScore)}
//               </Badge>
//             ) : null;
//           }, [turns])}
//         </Group>
//         {sending && (
//           <Group gap={6}>
//             <Loader size="xs" />
//             <Text size="sm" c="dimmed">thinking…</Text>
//           </Group>
//         )}
//       </Group>

//       {/* Gentle hint if resume is empty */}
//       {!resumeMd?.trim() && (
//         <Alert
//           variant="light"
//           color="yellow"
//           mb="xs"
//           icon={<IconAlertCircle size={16} />}
//           title="No resume text yet"
//         >
//           Upload or paste your resume above so answers can be personalized and scored accurately.
//         </Alert>
//       )}

//       <ScrollArea h={420} offsetScrollbars type="auto" viewportRef={viewportRef} styles={{ viewport: { padding: "0.25rem" } }}>
//         <Stack gap="sm">
//           {turns.map((t) => (
//             <Bubble key={t.id} role={t.role} score={t.score} ts={t.ts}>
//               {t.text}
//             </Bubble>
//           ))}
//         </Stack>
//       </ScrollArea>

//       <Stack mt="sm" gap="xs">
//         <Textarea
//           autosize
//           minRows={2}
//           maxRows={6}
//           placeholder="Ask about the job, interview prep, or how to tailor your resume… (Shift+Enter = newline)"
//           value={input}
//           onChange={(e) => setInput(e.currentTarget.value)}
//           onKeyDown={onKeyDown}
//         />
//         <Group justify="space-between">
//           <Text size="xs" c="dimmed">
//             I’ll use the current JD & your resume to answer.
//           </Text>
//           <Group>
//             <ActionIcon size="lg" radius="xl" variant="light" onClick={send} disabled={!canSend} aria-label="Send">
//               <IconSend size={18} />
//             </ActionIcon>
//             <Button onClick={send} disabled={!canSend} leftSection={<IconSend size={16} />}>
//               Send
//             </Button>
//           </Group>
//         </Group>
//       </Stack>
//     </Card>
//   );
// }

// function Bubble({
//   role,
//   children,
//   score,
//   ts,
// }: {
//   role: "user" | "assistant";
//   children: React.ReactNode;
//   score?: number;
//   ts: number;
// }) {
//   const isUser = role === "user";
//   return (
//     <Group align="flex-start" justify={isUser ? "flex-end" : "flex-start"} wrap="nowrap">
//       {!isUser && <AvatarIcon which="assistant" />}
//       <Card
//         withBorder
//         radius="lg"
//         padding="md"
//         className="max-w-[85%]"
//         style={{
//           background: isUser ? "var(--mantine-color-blue-0)" : "var(--mantine-color-gray-0)",
//           borderColor: isUser ? "var(--mantine-color-blue-3)" : "var(--mantine-color-gray-3)",
//         }}
//       >
//         <Stack gap={6}>
//           <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
//             {children}
//           </Text>
//           <Group gap="xs">
//             {typeof score === "number" && (
//               <Badge size="xs" variant="light" title="Fit score from this reply">
//                 Fit {Math.round(score)}
//               </Badge>
//             )}
//             <Text size="xs" c="dimmed">
//               {new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
//             </Text>
//           </Group>
//         </Stack>
//       </Card>
//       {isUser && <AvatarIcon which="user" />}
//     </Group>
//   );
// }

// function AvatarIcon({ which }: { which: "user" | "assistant" }) {
//   const Icon = which === "user" ? IconUser : IconRobot;
//   return (
//     <ActionIcon variant="light" radius="xl" size="lg" aria-label={which} title={which}>
//       <Icon size={18} />
//     </ActionIcon>
//   );
// }

// web/app/job/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Container, Group, Button, Badge, Title, Text, Loader } from "@mantine/core";
import { getJob, analyzeFit, generateCoverLetter, type Job } from "@/lib/api";
import { safeHtmlFromDb } from "@/lib/html";
import ResumeUpload from "@/components/ResumeUpload";
import AnalysisPanel from "@/components/AnalysisPanel";
import CoverLetterPanel from "@/components/CoverLetterPanel";
import JobChat from "@/components/JobChat";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  const [resumeText, setResumeText] = useState("");
  const [ready, setReady] = useState(false);

  const [analysis, setAnalysis] = useState<any>(null);
  const [letter, setLetter] = useState<string>("");
  const [chatOpen, setChatOpen] = useState(false);
  const chatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const j = await getJob(id);
        setJob(j);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const jobMd = useMemo(() => job?.description_md ?? "", [job]);
  const jobHtml = useMemo(() => safeHtmlFromDb(jobMd), [jobMd]);

  function openChat() {
    setChatOpen(true);
    requestAnimationFrame(() =>
      chatRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  async function runAnalysis() {
    if (!job) return;
    const res = await analyzeFit(job.id, resumeText);
    setAnalysis(res);
    openChat();
  }

  async function runLetter(variant: "short" | "standard" | "long" = "standard") {
    if (!job) return;
    const res = await generateCoverLetter(job.id, resumeText, variant);
    setLetter(res.letter_md);
  }

  if (loading) {
    return (
      <div className="w-full h-[50vh] grid place-items-center">
        <Loader />
      </div>
    );
  }

  if (!job) {
    return (
      <Container size="lg" className="py-10">
        <Title order={3}>Job not found</Title>
      </Container>
    );
  }

  const j = job as Job;

  return (
    <Container size="lg" className="py-8 space-y-6">
      <Group justify="space-between">
        <div>
          <Text size="sm" c="dimmed">
            {j.company}
          </Text>
          <Title order={2}>{j.title}</Title>
          <Badge mt="xs" variant="light">
            {j.location ?? "N/A"}
          </Badge>
        </div>
        <Group>
          <Button component="a" href={j.apply_url} target="_blank" rel="noopener noreferrer">
            Apply
          </Button>
          <Button variant="light" onClick={() => window.open(j.canonical_url || j.apply_url, "_blank")}>
            View posting
          </Button>
        </Group>
      </Group>

      <article className="prose max-w-none" dangerouslySetInnerHTML={{ __html: jobHtml }} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Title order={4}>Your resume</Title>
          <ResumeUpload onText={setResumeText} onParsed={openChat} onOpenChat={openChat} onReadyChange={setReady} />
          <Group>
            <Button disabled={!ready} onClick={runAnalysis}>
              Analyze fit
            </Button>
            <Button disabled={!ready} variant="light" onClick={() => runLetter()}>
              Generate cover letter
            </Button>
            <Button disabled={!ready} variant="subtle" onClick={openChat}>
              Open chat
            </Button>
          </Group>
        </div>

        <div className="space-y-6">
          {analysis && <AnalysisPanel result={analysis} />}
          {letter && (
            <CoverLetterPanel
              letter={letter}
              onVariant={(v) => runLetter(v)}
              onCopy={() => navigator.clipboard.writeText(letter)}
              onChange={setLetter}
            />
          )}
        </div>
      </div>

      {/* Job-specific Chat (always has JD + current resume text) */}
      <div ref={chatRef}>
        {chatOpen && <JobChat jobMd={jobMd} resumeMd={resumeText} />}
      </div>
    </Container>
  );
}

// // web/app/job/[id]/page.tsx
// "use client";

// import { useEffect, useMemo, useRef, useState } from "react";
// import { useParams } from "next/navigation";
// import {
//   Container,
//   Group,
//   Button,
//   Badge,
//   Title,
//   Text,
//   Loader,
// } from "@mantine/core";
// import { getJob, analyzeFit, generateCoverLetter, type Job } from "@/lib/api";
// import { safeHtmlFromDb } from "@/lib/html";
// import ResumeUpload from "@/components/ResumeUpload";
// import AnalysisPanel from "@/components/AnalysisPanel";
// import CoverLetterPanel from "@/components/CoverLetterPanel";
// import JobChat from "@/components/JobChat";

// export default function JobDetailPage() {
//   const params = useParams<{ id: string }>();
//   const id = params?.id;

//   const [job, setJob] = useState<Job | null>(null);
//   const [loading, setLoading] = useState(true);

//   const [resumeText, setResumeText] = useState("");
//   const [ready, setReady] = useState(false);

//   const [analysis, setAnalysis] = useState<any>(null);
//   const [letter, setLetter] = useState<string>("");
//   const [chatOpen, setChatOpen] = useState(false);
//   const chatRef = useRef<HTMLDivElement | null>(null);

//   useEffect(() => {
//     if (!id) return;
//     (async () => {
//       try {
//         const j = await getJob(id);
//         setJob(j);
//       } finally {
//         setLoading(false);
//       }
//     })();
//   }, [id]);

//   const jobMd = useMemo(() => job?.description_md ?? "", [job]);
//   const jobHtml = useMemo(() => safeHtmlFromDb(jobMd), [jobMd]);

//   function openChat() {
//     setChatOpen(true);
//     requestAnimationFrame(() =>
//       chatRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
//     );
//   }

//   async function runAnalysis() {
//     if (!job) return;
//     const res = await analyzeFit(job.id, resumeText);
//     setAnalysis(res);
//     openChat();
//   }

//   async function runLetter(
//     variant: "short" | "standard" | "long" = "standard"
//   ) {
//     if (!job) return;
//     const res = await generateCoverLetter(job.id, resumeText, variant);
//     setLetter(res.letter_md);
//   }

//   if (loading) {
//     return (
//       <div className="w-full h-[50vh] grid place-items-center">
//         <Loader />
//       </div>
//     );
//   }

//   if (!job) {
//     return (
//       <Container size="lg" className="py-10">
//         <Title order={3}>Job not found</Title>
//       </Container>
//     );
//   }

//   const j = job as Job;

//   return (
//     <Container size="lg" className="py-8 space-y-6">
//       <Group justify="space-between">
//         <div>
//           <Text size="sm" c="dimmed">
//             {j.company}
//           </Text>
//           <Title order={2}>{j.title}</Title>
//           <Badge mt="xs" variant="light">
//             {j.location ?? "N/A"}
//           </Badge>
//         </div>
//         <Group>
//           <Button
//             component="a"
//             href={j.apply_url}
//             target="_blank"
//             rel="noopener noreferrer"
//           >
//             Apply
//           </Button>
//           <Button
//             variant="light"
//             onClick={() =>
//               window.open(j.canonical_url || j.apply_url, "_blank")
//             }
//           >
//             View posting
//           </Button>
//         </Group>
//       </Group>

//       <article
//         className="prose max-w-none"
//         dangerouslySetInnerHTML={{ __html: jobHtml }}
//       />

//       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
//         <div className="space-y-4">
//           <Title order={4}>Your resume</Title>
//           <ResumeUpload
//             onText={setResumeText}
//             onParsed={openChat}
//             onOpenChat={openChat}
//             onReadyChange={setReady}
//           />
//           <Group>
//             <Button disabled={!ready} onClick={runAnalysis}>
//               Analyze fit
//             </Button>
//             <Button disabled={!ready} variant="light" onClick={() => runLetter()}>
//               Generate cover letter
//             </Button>
//             <Button disabled={!ready} variant="subtle" onClick={openChat}>
//               Open chat
//             </Button>
//           </Group>
//         </div>

//         <div className="space-y-6">
//           {analysis && <AnalysisPanel result={analysis} />}
//           {letter && (
//             <CoverLetterPanel
//               letter={letter}
//               onVariant={(v) => runLetter(v)}
//               onCopy={() => navigator.clipboard.writeText(letter)}
//               onChange={setLetter}
//             />
//           )}
//         </div>
//       </div>

//       {/* Job-specific Chat (always has JD + current resume text) */}
//       <div ref={chatRef}>
//         {chatOpen && <JobChat jobMd={jobMd} resumeMd={resumeText} />}
//       </div>
//     </Container>
//   );
// }


// // "use client";

// // import { useEffect, useState } from "react";
// // import { useParams } from "next/navigation";
// // import { Container, Group, Button, Badge, Title, Text, Loader } from "@mantine/core";
// // import { getJob, analyzeFit, generateCoverLetter, type Job } from "@/lib/api";
// // import { safeHtmlFromDb } from "@/lib/html";
// // import ResumeUpload from "@/components/ResumeUpload";
// // import AnalysisPanel from "@/components/AnalysisPanel";
// // import CoverLetterPanel from "@/components/CoverLetterPanel";

// // export default function JobDetailPage() {
// //   const params = useParams<{ id: string }>();
// //   const id = params?.id;
// //   const [job, setJob] = useState<Job | null>(null);
// //   const [loading, setLoading] = useState(true);
// //   const [resumeText, setResumeText] = useState("");
// //   const [analysis, setAnalysis] = useState<any>(null);
// //   const [letter, setLetter] = useState<string>("");

// //   useEffect(() => {
// //     if (!id) return;
// //     (async () => {
// //       try {
// //         const j = await getJob(id);
// //         setJob(j);
// //       } finally {
// //         setLoading(false);
// //       }
// //     })();
// //   }, [id]);

// //   if (loading) {
// //     return (
// //       <div className="w-full h-[50vh] grid place-items-center">
// //         <Loader />
// //       </div>
// //     );
// //   }
// //   if (!job) {
// //     return (
// //       <Container size="lg" className="py-10">
// //         <Title order={3}>Job not found</Title>
// //       </Container>
// //     );
// //   }

// //   const jobHtml = safeHtmlFromDb(job.description_md);

// //   const runAnalysis = async () => {
// //     const res = await analyzeFit({ job_id: job.id, resume_text: resumeText });
// //     setAnalysis(res);
// //   };
// //   const runLetter = async () => {
// //     const res = await generateCoverLetter({ job_id: job.id, resume_text: resumeText });
// //     setLetter(res.letter_md);
// //   };

// //   return (
// //     <Container size="lg" className="py-8 space-y-6">
// //       <Group justify="space-between">
// //         <div>
// //           <Text size="sm" c="dimmed">{job.company}</Text>
// //           <Title order={2}>{job.title}</Title>
// //           <Badge mt="xs" variant="light">{job.location ?? "N/A"}</Badge>
// //         </div>
// //         <Group>
// //           <Button
// //             component="a"
// //             href={job.apply_url}
// //             target="_blank"
// //             rel="noopener noreferrer"
// //           >
// //             Apply
// //           </Button>
// //           <Button variant="light" onClick={() => window.open(job.canonical_url || job.apply_url, "_blank")}>
// //             View posting
// //           </Button>
// //         </Group>
// //       </Group>

// //       {/* Job Description */}
// //       <article
// //         className="prose max-w-none"
// //         dangerouslySetInnerHTML={{ __html: jobHtml }}
// //       />

// //       {/* Resume + AI panels */}
// //       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
// //         <div className="space-y-4">
// //           <Title order={4}>Your resume</Title>
// //           <ResumeUpload onText={(t) => setResumeText(t)} />
// //           <Group>
// //             <Button disabled={!resumeText} onClick={runAnalysis}>Analyze fit</Button>
// //             <Button disabled={!resumeText} variant="light" onClick={runLetter}>Generate cover letter</Button>
// //           </Group>
// //         </div>
// //         <div className="space-y-6">
// //           {analysis && <AnalysisPanel result={analysis} />}
// //           {letter && <CoverLetterPanel letter={letter} />}
// //         </div>
// //       </div>
// //     </Container>
// //   );
// // }


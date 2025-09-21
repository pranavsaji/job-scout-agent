"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation"; // Import useRouter
import { Container, Title, SimpleGrid, Group, Button, Text, Loader, Alert, rem } from "@mantine/core";
import { IconAlertCircle, IconRefresh, IconDownload, IconTrash, IconCloudDownload } from "@tabler/icons-react";
import Filters from "@/components/Filters";
import JobCard from "@/components/JobCard";

// ------- Types (keep in sync with your backend DTO) -------
export type Job = {
  id: string | number;
  title: string;
  company: string;
  location?: string | null;
  level?: string | null;
  remote?: string | boolean | null;
  url?: string | null;
  apply_url?: string | null;
  canonical_url?: string | null;
  posted_at?: string | null; // ISO date from DB
  created_at?: string | null;
  source?: string | null;
  description?: string | null;
  description_md?: string | null;
};

export type JobFilter = {
  q?: string | null;
  remote?: string | null;
  level?: string | null;
  location?: string | null;
  // IMPORTANT: keep this null by default to avoid hidden 24h cutoff
  posted_within_hours?: number | null;
};

// Helper to build backend base URL for local/prod
function apiBase() {
  // Prefer NEXT_PUBLIC_API_BASE when running the web app separately from API
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE;
  }
  // Otherwise, assume same-origin reverse proxy (Next.js rewrites) or dev proxy
  return "";
}

async function searchAllJobs({
  limit,
  offset,
  filter,
  signal,
}: {
  limit: number;
  offset: number;
  filter: JobFilter;
  signal?: AbortSignal;
}): Promise<Job[]> {
  const base = apiBase();
  const url = `${base}/jobs/search?q_limit=${encodeURIComponent(limit)}&q_offset=${encodeURIComponent(offset)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filter),
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  // Expecting array of jobs
  return Array.isArray(data) ? data : [];
}

export default function HomePage() {
  const LIMIT = 21; // Tune for your UI (e.g., 3 rows of 7)
  const router = useRouter(); // For navigation

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  // New state for pagination
  const [page, setPage] = useState(1);
  const [cleaning, setCleaning] = useState(false);

  // Filters state lives here and is passed to <Filters />
  const [filters, setFilters] = useState<JobFilter>({ posted_within_hours: null });

  const effectiveFilters = useMemo<JobFilter>(() => {
    // Clean up empty strings to avoid accidental filtering
    const f: JobFilter = { ...filters };
    (Object.keys(f) as (keyof JobFilter)[]).forEach((k) => {
      if (f[k] === "") (f as any)[k] = null;
    });
    // Enforce the fix: do NOT apply a default 24h cutoff
    if (f.posted_within_hours === undefined) f.posted_within_hours = null;
    return f;
  }, [filters]);
  
  // New function to handle pagination and initial load
  const loadJobsForPage = useCallback(async (newPage: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    
    try {
      const newOffset = (newPage - 1) * LIMIT;
      const results = await searchAllJobs({
        limit: LIMIT,
        offset: newOffset,
        filter: effectiveFilters,
        signal: controller.signal,
      });
      setJobs(results);
      setPage(newPage);
      setHasMore(results.length === LIMIT);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e?.message ?? "Failed to load jobs");
      }
    } finally {
      setLoading(false);
    }
  }, [LIMIT, effectiveFilters]);

  // Initial load + filter changes (reset to page 1)
  useEffect(() => {
    loadJobsForPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveFilters]);

  // Simple auto-refresh hook
  const onRefresh = useCallback(() => {
    loadJobsForPage(page);
  }, [page, loadJobsForPage]);
  
  // New: handler for cleaning old jobs
  const handleCleanup = async () => {
    setCleaning(true);
    setError(null);
    try {
      await fetch('/api/jobs/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttl_hours: 48 }),
      });
      // Refresh the current page after cleaning
      onRefresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to clean old jobs');
    } finally {
      setCleaning(false);
    }
  };


  // Export: quick CSV of current result set
  const onExport = useCallback(() => {
    const header = ["id","title","company","location","level","remote","source","url","posted_at"];
    const rows = jobs.map((j) => [
      j.id,
      j.title,
      j.company,
      j.location ?? "",
      j.level ?? "",
      String(j.remote ?? ""),
      j.source ?? "",
      j.apply_url ?? "",
      j.posted_at ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replaceAll('"','""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jobs_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [jobs]);

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" align="center" mb="md">
        <div>
          <Title order={2}>All Jobs</Title>
          <Text c="dimmed" size="sm">Showing jobs from your database. Use filters to narrow down.</Text>
        </div>
        <Group gap="xs">
          {/* --- NEW BUTTONS --- */}
          <Button
            size="sm"
            variant="light"
            leftSection={<IconCloudDownload size={rem(16)} />}
            onClick={() => router.push('/harvest')}
            title="Open scraper page"
          >
            Scrape
          </Button>
          <Button
            size="sm"
            variant="outline"
            leftSection={<IconTrash size={rem(16)} />}
            onClick={handleCleanup}
            loading={cleaning}
            title="Delete jobs older than 48 hours"
          >
            Clean &gt; 48h
          </Button>
           <Button variant="default" onClick={onRefresh} leftSection={<IconRefresh size={16} />}>Refresh</Button>
          <Button variant="light" onClick={onExport} leftSection={<IconDownload size={16} />}>Export CSV</Button>
        </Group>
      </Group>

      {/* Filters: keep posted_within_hours = null unless user explicitly sets it */}
      <Filters
        value={filters as any}
        onChange={(next: any) => {
          setFilters((prev) => ({ ...prev, ...next, posted_within_hours: next?.posted_within_hours ?? null }));
        }}
      />

      {error && (
        <Alert color="red" icon={<IconAlertCircle />} my="md">
          {error}
        </Alert>
      )}

      {loading && jobs.length === 0 ? (
        <Group justify="center" my="xl"><Loader /></Group>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md" mt="md">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job as any} />
          ))}
        </SimpleGrid>
      )}

      {/* --- NEW PAGINATION CONTROLS --- */}
      <Group justify="center" mt="lg">
        <Button variant="default" disabled={page <= 1 || loading} onClick={() => loadJobsForPage(page - 1)}>
          ← Previous
        </Button>
        <Text c="dimmed" fw={500}>Page {page}</Text>
        <Button variant="default" disabled={!hasMore || loading} onClick={() => loadJobsForPage(page + 1)}>
          Next →
        </Button>
      </Group>

    </Container>
  );
}

// "use client";

// import { useEffect, useMemo, useState } from "react";
// import {
//   Container,
//   Title,
//   SimpleGrid,
//   Group,
//   Button,
//   Text,
//   rem,
// } from "@mantine/core";
// import { useRouter } from "next/navigation";
// import { IconExternalLink, IconTrash } from "@tabler/icons-react";
// import Filters from "@/components/Filters";
// import JobCard from "@/components/JobCard";
// import { Job, searchJobs, recentJobs } from "@/lib/api";

// type DateRange = { from?: Date | null; to?: Date | null };

// export default function Home() {
//   const router = useRouter();

//   const [jobs, setJobs] = useState<Job[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [cleaning, setCleaning] = useState(false);
//   const [offset, setOffset] = useState(0);
//   const [limit] = useState(21);

//   // Include date-range in filters; default to not limiting to last24h
//   const [filters, setFilters] = useState({
//     q: "",
//     policy: "any",
//     seniority: "any",
//     last24h: false,
//     range: { from: null, to: null } as DateRange,
//   });

//   const hasPrev = offset > 0;
//   const hasNext = jobs.length === limit;

//   function toISO(d?: Date | null) {
//     return d ? new Date(d).toISOString() : undefined;
//   }

//   async function runSearch(resetOffset = false) {
//     setLoading(true);

//     const { q, policy, seniority, last24h, range } = filters;

//     const body: any = {
//       q: q?.trim() || undefined,
//       limit,
//       offset: resetOffset ? 0 : offset,
//     };

//     // Prefer explicit date range if provided; otherwise use last24h toggle
//     if (range?.from || range?.to) {
//       body.date_from = toISO(range.from);
//       body.date_to = toISO(range.to);
//     } else if (last24h) {
//       body.posted_within_hours = 24;
//     }

//     if (policy !== "any") body.remote = policy;
//     if (seniority !== "any") body.level = seniority;

//     try {
//       const res = await searchJobs(body);
//       setJobs(res);
//       if (resetOffset) setOffset(0);
//     } catch {
//       const fallback = await recentJobs(limit);
//       setJobs(fallback);
//       if (resetOffset) setOffset(0);
//     } finally {
//       setLoading(false);
//     }
//   }

//   // Initial load
//   useEffect(() => {
//     (async () => {
//       setLoading(true);
//       try {
//         const rec = await recentJobs(limit);
//         setJobs(rec);
//       } finally {
//         setLoading(false);
//       }
//     })();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   // Trigger backend cleanup (delete older-than window) via Next API proxy, then refresh
//   async function triggerCleanup() {
//     setCleaning(true);
//     try {
//       await fetch("/api/jobs/cleanup", {
//         method: "POST",
//         headers: { "content-type": "application/json" },
//         body: JSON.stringify({ ttl_hours: 48 }),
//       });
//       await runSearch(true);
//     } catch {
//       // no-op; UI stays as-is
//     } finally {
//       setCleaning(false);
//     }
//   }

//   const grid = useMemo(() => {
//     if (!jobs.length && !loading) {
//       return (
//         <Text c="dimmed" ta="center" py="xl">
//           No jobs found. Try clearing filters or widening the date range.
//         </Text>
//       );
//     }
//     return (
//       <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
//         {(loading
//           ? Array.from({ length: 9 }).map((_, i) => ({ id: `s${i}` } as any))
//           : jobs
//         ).map((j: Job) => (
//           <div key={j.id}>
//             {loading ? (
//               <div style={{ height: 200, borderRadius: 12, background: "#f3f4f6" }} />
//             ) : (
//               <JobCard job={j} />
//             )}
//           </div>
//         ))}
//       </SimpleGrid>
//     );
//   }, [jobs, loading]);

//   return (
//     <Container size="lg" py="md">
//       {/* Title + admin actions */}
//       <Group justify="space-between" mb="sm">
//         <Title order={2}>Job Scout</Title>
//         <Group gap="xs">
//           <Button
//             size="xs"
//             variant="light"
//             leftSection={<IconExternalLink size={rem(14)} />}
//             onClick={() => router.push("/harvest")} // open dedicated scraper page
//             title="Open scraper with options"
//           >
//             Scrape
//           </Button>
//           <Button
//             size="xs"
//             variant="outline"
//             leftSection={<IconTrash size={rem(14)} />}
//             onClick={triggerCleanup}
//             loading={cleaning}
//             title="Delete jobs older than 48 hours"
//           >
//             Clean &gt; 48h
//           </Button>
//         </Group>
//       </Group>

//       {/* Filters */}
//       <Filters
//         initial={filters}
//         onApply={(f) => {
//           setFilters(f);
//           runSearch(true);
//         }}
//         onReset={() => {
//           const reset = {
//             q: "",
//             policy: "any",
//             seniority: "any",
//             last24h: false,
//             range: { from: null, to: null } as DateRange,
//           };
//           setFilters(reset);
//           runSearch(true);
//         }}
//       />

//       {grid}

//       {/* Pagination */}
//       <Group justify="space-between" mt="md">
//         <Button
//           variant="default"
//           disabled={!hasPrev || loading}
//           onClick={() => {
//             setOffset(Math.max(0, offset - limit));
//             runSearch(false);
//           }}
//         >
//           ← Prev
//         </Button>
//         <Text c="dimmed">Page {Math.floor(offset / limit) + 1}</Text>
//         <Button
//           variant="default"
//           disabled={!hasNext || loading}
//           onClick={() => {
//             setOffset(offset + limit);
//             runSearch(false);
//           }}
//         >
//           Next →
//         </Button>
//       </Group>
//     </Container>
//   );
// }



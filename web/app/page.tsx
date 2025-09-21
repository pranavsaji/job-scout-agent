"use client";

import { useEffect, useMemo, useState } from "react";
import { Container, Title, SimpleGrid, Group, Button, Text } from "@mantine/core";
import Filters from "@/components/Filters";
import JobCard from "@/components/JobCard";
import { Job, searchJobs, recentJobs } from "@/lib/api";

type DateRange = { from?: Date | null; to?: Date | null };

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(21);

  // add date range in filters; turn off last24h by default so we don’t hide data
  const [filters, setFilters] = useState({
    q: "",
    policy: "any",
    seniority: "any",
    last24h: false,
    range: { from: null, to: null } as DateRange,
  });

  const hasPrev = offset > 0;
  const hasNext = jobs.length === limit;

  function toISO(d?: Date | null) {
    return d ? new Date(d).toISOString() : undefined;
  }

  async function runSearch(resetOffset = false) {
    setLoading(true);

    const { q, policy, seniority, last24h, range } = filters;

    // Build body
    const body: any = {
      q: q?.trim() || undefined,
      limit,
      offset: resetOffset ? 0 : offset,
    };

    // If a date range is selected, send it; otherwise optionally send last24h
    if (range?.from || range?.to) {
      body.date_from = toISO(range.from);
      body.date_to = toISO(range.to);
    } else if (last24h) {
      body.posted_within_hours = 24;
    }

    if (policy !== "any") body.remote = policy;
    if (seniority !== "any") body.level = seniority;

    try {
      const res = await searchJobs(body);
      setJobs(res);
      if (resetOffset) setOffset(0);
    } catch {
      const fallback = await recentJobs(limit);
      setJobs(fallback);
      if (resetOffset) setOffset(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const rec = await recentJobs(limit);
        setJobs(rec);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grid = useMemo(() => {
    if (!jobs.length && !loading) {
      return (
        <Text c="dimmed" ta="center" py="xl">
          No jobs found. Try clearing filters or widening the date range.
        </Text>
      );
    }
    return (
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {(loading ? Array.from({ length: 9 }).map((_, i) => ({ id: `s${i}` } as any)) : jobs).map(
          (j: Job) => (
            <div key={j.id}>
              {loading ? (
                <div style={{ height: 200, borderRadius: 12, background: "#f3f4f6" }} />
              ) : (
                <JobCard job={j} />
              )}
            </div>
          ),
        )}
      </SimpleGrid>
    );
  }, [jobs, loading]);

  return (
    <Container size="lg" py="md">
      <Title order={2} mb="sm">
        Job Scout
      </Title>

      <Filters
        initial={filters}
        onApply={(f) => {
          setFilters(f);
          runSearch(true);
        }}
        onReset={() => {
          const reset = {
            q: "",
            policy: "any",
            seniority: "any",
            last24h: false,
            range: { from: null, to: null } as DateRange,
          };
          setFilters(reset);
          runSearch(true);
        }}
      />

      {grid}

      <Group justify="space-between" mt="md">
        <Button
          variant="default"
          disabled={!hasPrev || loading}
          onClick={() => {
            setOffset(Math.max(0, offset - limit));
            runSearch(false);
          }}
        >
          ← Prev
        </Button>
        <Text c="dimmed">Page {Math.floor(offset / limit) + 1}</Text>
        <Button
          variant="default"
          disabled={!hasNext || loading}
          onClick={() => {
            setOffset(offset + limit);
            runSearch(false);
          }}
        >
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
// } from "@mantine/core";
// import { IconExternalLink, IconTrash } from "@tabler/icons-react";
// import { useRouter } from "next/navigation";
// import Filters from "@/components/Filters";
// import JobCard from "@/components/JobCard";
// import { Job, searchJobs, recentJobs } from "@/lib/api";

// export default function Home() {
//   const router = useRouter();
//   const [jobs, setJobs] = useState<Job[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [cleaning, setCleaning] = useState(false);
//   const [offset, setOffset] = useState(0);
//   const [limit] = useState(21);
//   const [filters, setFilters] = useState({
//     q: "",
//     policy: "any",
//     seniority: "any",
//     last24h: false,
//   });

//   const hasPrev = offset > 0;
//   const hasNext = jobs.length === limit;

//   async function runSearch(resetOffset = false) {
//     setLoading(true);
//     const body: any = {
//       q: filters.q?.trim() || undefined,
//       limit,
//       offset: resetOffset ? 0 : offset,
//       posted_within_hours: filters.last24h ? 24 : undefined,
//     };
//     if (filters.policy !== "any") body.remote = filters.policy;
//     if (filters.seniority !== "any") body.level = filters.seniority;

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

//   async function triggerCleanup() {
//     setCleaning(true);
//     try {
//       await fetch("/api/jobs/cleanup", {
//         method: "POST",
//         headers: { "content-type": "application/json" },
//         body: JSON.stringify({ ttl_hours: 48 }), // 2 days
//       });
//       await runSearch(true);
//     } finally {
//       setCleaning(false);
//     }
//   }

//   const grid = useMemo(() => {
//     if (!jobs.length && !loading) {
//       return (
//         <Text c="dimmed" ta="center" py="xl">
//           No jobs found. Try clearing filters.
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
//               <div
//                 style={{ height: 200, borderRadius: 12, background: "#f3f4f6" }}
//               />
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
//       <Group justify="space-between" mb="sm">
//         <Title order={2}>Job Scout</Title>
//         <Group gap="xs">
//           <Button
//             onClick={() => router.push("/harvest")}
//             leftSection={<IconExternalLink size={16} />}
//             title="Open scraper with options"
//           >
//             Open Scraper
//           </Button>
//           <Button
//             variant="outline"
//             onClick={triggerCleanup}
//             loading={cleaning}
//             leftSection={<IconTrash size={16} />}
//             title="Delete jobs older than 48 hours"
//           >
//             {cleaning ? "Cleaning…" : "Clean > 48h"}
//           </Button>
//         </Group>
//       </Group>

//       <Filters
//         initial={filters}
//         onApply={(f) => {
//           setFilters(f);
//           runSearch(true);
//         }}
//       />

//       {grid}

//       <Group justify="space-between" mt="md">
//         <Button
//           variant="default"
//           disabled={!hasPrev || loading}
//           onClick={() => {
//             const nextOffset = Math.max(0, offset - limit);
//             setOffset(nextOffset);
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
//             const nextOffset = offset + limit;
//             setOffset(nextOffset);
//             runSearch(false);
//           }}
//         >
//           Next →
//         </Button>
//       </Group>
//     </Container>
//   );
// }



// // "use client";

// // import { useEffect, useMemo, useState } from "react";
// // import { Container, Title, SimpleGrid, Group, Button, Text } from "@mantine/core";
// // import Filters from "@/components/Filters";
// // import JobCard from "@/components/JobCard";
// // import { Job, searchJobs, recentJobs } from "@/lib/api";

// // export default function Home() {
// //   const [jobs, setJobs] = useState<Job[]>([]);
// //   const [loading, setLoading] = useState(false);
// //   const [offset, setOffset] = useState(0);
// //   const [limit] = useState(21);
// //   const [filters, setFilters] = useState({ q: "", policy: "any", seniority: "any", last24h: true });

// //   const hasPrev = offset > 0;
// //   const hasNext = jobs.length === limit;

// //   async function runSearch(resetOffset = false) {
// //     setLoading(true);
// //     const body: any = {
// //       q: filters.q?.trim() || undefined,
// //       limit,
// //       offset: resetOffset ? 0 : offset,
// //       posted_within_hours: filters.last24h ? 24 : undefined,
// //     };
// //     if (filters.policy !== "any") body.remote = filters.policy;
// //     if (filters.seniority !== "any") body.level = filters.seniority;

// //     try {
// //       const res = await searchJobs(body);
// //       setJobs(res);
// //       if (resetOffset) setOffset(0);
// //     } catch {
// //       const fallback = await recentJobs(limit);
// //       setJobs(fallback);
// //       if (resetOffset) setOffset(0);
// //     } finally {
// //       setLoading(false);
// //     }
// //   }

// //   useEffect(() => {
// //     (async () => {
// //       setLoading(true);
// //       try {
// //         const rec = await recentJobs(limit);
// //         setJobs(rec);
// //       } finally {
// //         setLoading(false);
// //       }
// //     })();
// //     // eslint-disable-next-line react-hooks/exhaustive-deps
// //   }, []);

// //   const grid = useMemo(() => {
// //     if (!jobs.length && !loading) {
// //       return <Text c="dimmed" ta="center" py="xl">No jobs found. Try clearing filters.</Text>;
// //     }
// //     return (
// //       <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
// //         {(loading ? Array.from({ length: 9 }).map((_, i) => ({ id: `s${i}` } as any)) : jobs).map((j: Job) => (
// //           <div key={j.id}>
// //             {loading ? (
// //               <div style={{ height: 200, borderRadius: 12, background: "#f3f4f6" }} />
// //             ) : (
// //               <JobCard job={j} />
// //             )}
// //           </div>
// //         ))}
// //       </SimpleGrid>
// //     );
// //   }, [jobs, loading]);

// //   return (
// //     <Container size="lg" py="md">
// //       <Title order={2} mb="sm">Job Scout</Title>
// //       <Filters
// //         initial={filters}
// //         onApply={(f) => { setFilters(f); runSearch(true); }}
// //       />
// //       {grid}
// //       <Group justify="space-between" mt="md">
// //         <Button
// //           variant="default"
// //           disabled={!hasPrev || loading}
// //           onClick={() => { setOffset(Math.max(0, offset - limit)); runSearch(false); }}
// //         >
// //           ← Prev
// //         </Button>
// //         <Text c="dimmed">Page {Math.floor(offset / limit) + 1}</Text>
// //         <Button
// //           variant="default"
// //           disabled={!hasNext || loading}
// //           onClick={() => { setOffset(offset + limit); runSearch(false); }}
// //         >
// //           Next →
// //         </Button>
// //       </Group>
// //     </Container>
// //   );
// // }

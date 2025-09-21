"use client";

import { useEffect, useMemo, useState } from "react";
import { Container, Title, SimpleGrid, Group, Button, Text } from "@mantine/core";
import Filters from "@/components/Filters";
import JobCard from "@/components/JobCard";
import { Job, searchJobs, recentJobs } from "@/lib/api";

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(21);
  const [filters, setFilters] = useState({ q: "", policy: "any", seniority: "any", last24h: true });

  const hasPrev = offset > 0;
  const hasNext = jobs.length === limit;

  async function runSearch(resetOffset = false) {
    setLoading(true);
    const body: any = {
      q: filters.q?.trim() || undefined,
      limit,
      offset: resetOffset ? 0 : offset,
      posted_within_hours: filters.last24h ? 24 : undefined,
    };
    if (filters.policy !== "any") body.remote = filters.policy;
    if (filters.seniority !== "any") body.level = filters.seniority;

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
      return <Text c="dimmed" ta="center" py="xl">No jobs found. Try clearing filters.</Text>;
    }
    return (
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {(loading ? Array.from({ length: 9 }).map((_, i) => ({ id: `s${i}` } as any)) : jobs).map((j: Job) => (
          <div key={j.id}>
            {loading ? (
              <div style={{ height: 200, borderRadius: 12, background: "#f3f4f6" }} />
            ) : (
              <JobCard job={j} />
            )}
          </div>
        ))}
      </SimpleGrid>
    );
  }, [jobs, loading]);

  return (
    <Container size="lg" py="md">
      <Title order={2} mb="sm">Job Scout</Title>
      <Filters
        initial={filters}
        onApply={(f) => { setFilters(f); runSearch(true); }}
      />
      {grid}
      <Group justify="space-between" mt="md">
        <Button
          variant="default"
          disabled={!hasPrev || loading}
          onClick={() => { setOffset(Math.max(0, offset - limit)); runSearch(false); }}
        >
          ← Prev
        </Button>
        <Text c="dimmed">Page {Math.floor(offset / limit) + 1}</Text>
        <Button
          variant="default"
          disabled={!hasNext || loading}
          onClick={() => { setOffset(offset + limit); runSearch(false); }}
        >
          Next →
        </Button>
      </Group>
    </Container>
  );
}

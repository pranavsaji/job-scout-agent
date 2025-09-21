// app/harvest/page.tsx
"use client";

import { useState } from "react";
import {
  Container,
  Title,
  Stack,
  Group,
  Button,
  Text,
  TextInput,
  Checkbox,
  NumberInput,
  Paper,
  Divider,
  Alert,
  Loader,
  Code,
  Badge,
} from "@mantine/core";
import { IconAlertCircle, IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";

type HarvestResult = Record<string, any>;

const BACKEND =
  (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "") || ""; // when blank, you’re likely proxying via /api

export default function HarvestPage() {
  const [sources, setSources] = useState<string[]>(["greenhouse", "ashby"]);
  const [ashbyOrgs, setAshbyOrgs] = useState("perplexity, togetherai, roblox");
  const [greenhouseOrgs, setGreenhouseOrgs] = useState("stripe, notion, databricks, snowflake");
  const [leverOrgs, setLeverOrgs] = useState("sentry, zapier, robinhood, nylas");
  const [windowHours, setWindowHours] = useState<number | "">(48);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false); // reserved for future cancel
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HarvestResult | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupDeleted, setCleanupDeleted] = useState<number | null>(null);

  const onToggle = (name: string) => {
    setSources((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );
  };

  const runHarvest = async () => {
    setError(null);
    setResult(null);
    setRunning(true);
    try {
      // Build payload
      const payload: any = {
        sources,
        // generic orgs (optional): leave empty to rely on per-source lists/env
        orgs: [],
        ashby_orgs: csvToList(ashbyOrgs),
        greenhouse_orgs: csvToList(greenhouseOrgs),
        extra: {
          window_hours: Number(windowHours || 48),
        },
      };

      const url = BACKEND ? `${BACKEND}/harvest/run` : "/api/harvest/run";
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText} — ${await res.text()}`);
      }
      const json = await res.json();
      setResult(json);
    } catch (e: any) {
      setError(e?.message || "Harvest failed");
    } finally {
      setRunning(false);
    }
  };

  const doCleanup = async () => {
    setCleanupLoading(true);
    setCleanupDeleted(null);
    setError(null);
    try {
      const ttl = Number(windowHours || 48); // reuse the same control for convenience
      // Prefer POST /jobs/cleanup if available; otherwise DELETE with query
      const postUrl = BACKEND ? `${BACKEND}/jobs/cleanup` : "/api/jobs/cleanup";
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ttl_hours: ttl }),
      });

      if (!res.ok) {
        // Try GET/DELETE fallback
        const delUrl =
          (BACKEND ? `${BACKEND}` : "/api") + `/jobs/cleanup?ttl_hours=${ttl}`;
        const alt = await fetch(delUrl, { method: "DELETE" });
        if (!alt.ok) {
          throw new Error(`${alt.status} ${alt.statusText} — ${await alt.text()}`);
        }
        const j2 = await alt.json();
        setCleanupDeleted(Number(j2.deleted || 0));
      } else {
        const j = await res.json();
        setCleanupDeleted(Number(j.deleted || 0));
      }
    } catch (e: any) {
      setError(e?.message || "Cleanup failed");
    } finally {
      setCleanupLoading(false);
    }
  };

  return (
    <Container size="lg" py="md">
      <Group justify="space-between" mb="sm">
        <Title order={2}>Harvest / Scrape Jobs</Title>
        <Badge variant="light" title="TTL used by cleanup">{`TTL: ${Number(
          windowHours || 48
        )}h`}</Badge>
      </Group>

      {error && (
        <Alert
          color="red"
          mb="md"
          icon={<IconAlertCircle size={16} />}
          title="Action failed"
        >
          {error}
        </Alert>
      )}

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text fw={600}>Sources</Text>
          <Group>
            <Checkbox
              label="Greenhouse"
              checked={sources.includes("greenhouse")}
              onChange={() => onToggle("greenhouse")}
            />
            <Checkbox
              label="Ashby"
              checked={sources.includes("ashby")}
              onChange={() => onToggle("ashby")}
            />
            <Checkbox
              label="Lever"
              checked={sources.includes("lever")}
              onChange={() => onToggle("lever")}
            />
            {/* Add more (Workday, etc.) later when wired */}
          </Group>

          <Divider my="xs" />

          <Text fw={600}>Org lists (CSV)</Text>
          <Text size="sm" c="dimmed">
            Example: <Code>stripe, notion, databricks</Code>
          </Text>

          <TextInput
            label="Greenhouse boards"
            placeholder="stripe, notion, databricks, snowflake"
            value={greenhouseOrgs}
            onChange={(e) => setGreenhouseOrgs(e.currentTarget.value)}
          />
          <TextInput
            label="Ashby orgs"
            placeholder="perplexity, togetherai, roblox"
            value={ashbyOrgs}
            onChange={(e) => setAshbyOrgs(e.currentTarget.value)}
          />
          <TextInput
            label="Lever companies"
            placeholder="sentry, zapier, robinhood, nylas"
            value={leverOrgs}
            onChange={(e) => setLeverOrgs(e.currentTarget.value)}
          />

          <NumberInput
            label="Window hours (used for harvest filter & cleanup TTL)"
            min={1}
            max={24 * 7}
            value={windowHours}
            onChange={setWindowHours}
          />

          <Group mt="xs">
            <Button
              onClick={runHarvest}
              disabled={running}
              leftSection={<IconPlayerPlay size={16} />}
            >
              {running ? (
                <Group gap={6}>
                  <Loader size="xs" /> <Text>Harvesting…</Text>
                </Group>
              ) : (
                "Run Harvest"
              )}
            </Button>
            <Button
              variant="light"
              color="red"
              disabled={stopping || running}
              leftSection={<IconPlayerStop size={16} />}
              onClick={() => setStopping(true)} // placeholder; hook up cancellation if you add it server-side
            >
              Stop
            </Button>

            <Button
              variant="default"
              onClick={doCleanup}
              disabled={cleanupLoading}
            >
              {cleanupLoading ? "Cleaning…" : "Cleanup old jobs"}
            </Button>
          </Group>
        </Stack>
      </Paper>

      {result && (
        <>
          <Divider my="md" />
          <Title order={4} mb="xs">
            Harvest result
          </Title>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "var(--mantine-color-gray-0)",
              border: "1px solid var(--mantine-color-gray-3)",
              padding: 12,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </>
      )}

      {cleanupDeleted !== null && (
        <Alert mt="md" color="teal" title="Cleanup finished">
          Deleted <b>{cleanupDeleted}</b> jobs older than {Number(windowHours || 48)}h.
        </Alert>
      )}
    </Container>
  );
}

// utils
function csvToList(s: string): string[] {
  return (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

"use client";
import { useState } from "react";
import { Button } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";

export default function CleanupButton({ ttl = 48 }: { ttl?: number }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  async function run() {
    setLoading(true);
    setResult("");
    try {
      const r = await fetch("/api/jobs/cleanup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ttl_hours: ttl }),
      });
      const j = await r.json().catch(() => ({}));
      setResult(r.ok ? `Deleted ${j.deleted ?? 0}` : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button leftSection={<IconTrash size={16} />} onClick={run} loading={loading} variant="outline">
      {result || `Clean > ${ttl}h`}
    </Button>
  );
}

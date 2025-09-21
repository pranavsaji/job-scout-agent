"use client";

import { useState } from "react";
import { Button } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";

export default function ScrapeButton({ label = "Scrape now" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<null | "ok" | "err">(null);

  async function run() {
    setLoading(true);
    setDone(null);
    try {
      const r = await fetch("/api/harvest/run", { method: "POST" });
      setDone(r.ok ? "ok" : "err");
    } catch {
      setDone("err");
    } finally {
      setLoading(false);
    }
  }

  const variant = done === "ok" ? "light" : done === "err" ? "outline" : "filled";

  return (
    <Button
      leftSection={<IconRefresh size={16} />}
      onClick={run}
      loading={loading}
      variant={variant}
      title="Trigger job scrapers on the server"
    >
      {done === "ok" ? "Started" : done === "err" ? "Failed" : label}
    </Button>
  );
}

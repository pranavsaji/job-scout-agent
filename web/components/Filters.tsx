"use client";
import { useEffect, useState } from "react";
import { Button, Checkbox, Group, Select, TextInput, Paper } from "@mantine/core";

type Props = {
  onApply: (filters: { q: string; policy: string; seniority: string; last24h: boolean }) => void;
  initial?: Partial<{ q: string; policy: string; seniority: string; last24h: boolean }>;
};

const POLICIES = ["any", "remote", "hybrid", "onsite"];
const SENIORITY = ["any", "junior", "mid", "senior", "staff", "lead"];

export default function Filters({ onApply, initial }: Props) {
  const [q, setQ] = useState(initial?.q ?? "");
  const [policy, setPolicy] = useState(initial?.policy ?? "any");
  const [seniority, setSeniority] = useState(initial?.seniority ?? "any");
  const [last24h, setLast24h] = useState(initial?.last24h ?? true);

  useEffect(() => {
    onApply({ q, policy, seniority, last24h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Paper withBorder p="md" radius="md" mb="md" shadow="xs">
      <Group align="end" wrap="wrap">
        <TextInput
          label="Keyword"
          placeholder="e.g. ai engineer"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 240 }}
        />
        <Select
          label="Policy"
          value={policy}
          onChange={(v) => setPolicy(v || "any")}
          data={POLICIES}
          style={{ width: 180 }}
        />
        <Select
          label="Seniority"
          value={seniority}
          onChange={(v) => setSeniority(v || "any")}
          data={SENIORITY}
          style={{ width: 180 }}
        />
        <Checkbox
          label="Last 24h"
          checked={last24h}
          onChange={(e) => setLast24h(e.currentTarget.checked)}
          styles={{ root: { alignSelf: "center" } }}
        />
        <Button onClick={() => onApply({ q, policy, seniority, last24h })}>Apply</Button>
      </Group>
    </Paper>
  );
}

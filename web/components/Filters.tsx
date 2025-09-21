"use client";

import { useEffect, useState } from "react";
import {
  Paper,
  Group,
  TextInput,
  Button,
  SegmentedControl,
  Grid,
  Switch,
  Tooltip,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconCalendar, IconFilter, IconX } from "@tabler/icons-react";

type DateRange = { from?: Date | null; to?: Date | null };

type FiltersState = {
  q: string;
  policy: "any" | "remote" | "hybrid" | "onsite";
  seniority: "any" | "junior" | "mid" | "senior" | "lead" | "staff" | "principal";
  last24h: boolean;
  range: DateRange;
};

export default function Filters({
  initial,
  onApply,
  onReset,
}: {
  initial: FiltersState;
  onApply: (f: FiltersState) => void;
  onReset?: () => void;
}) {
  const [state, setState] = useState<FiltersState>(initial);

  useEffect(() => setState(initial), [initial]);

  const hasRange = !!state.range?.from || !!state.range?.to;

  return (
    <Paper withBorder radius="lg" p="md" mb="md">
      <Grid gutter="md" align="end">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <TextInput
            label="Search"
            placeholder="Keywords (company, title, text...)"
            value={state.q}
            onChange={(e) => setState({ ...state, q: e.currentTarget.value })}
            leftSection={<IconFilter size={16} />}
          />
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 4, md: 3 }}>
          <SegmentedControl
            fullWidth
            value={state.policy}
            onChange={(v) => setState({ ...state, policy: v as FiltersState["policy"] })}
            data={[
              { label: "Any", value: "any" },
              { label: "Remote", value: "remote" },
              { label: "Hybrid", value: "hybrid" },
              { label: "Onsite", value: "onsite" },
            ]}
          />
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 4, md: 3 }}>
          <SegmentedControl
            fullWidth
            value={state.seniority}
            onChange={(v) => setState({ ...state, seniority: v as FiltersState["seniority"] })}
            data={[
              { label: "Any", value: "any" },
              { label: "Jr", value: "junior" },
              { label: "Mid", value: "mid" },
              { label: "Sr", value: "senior" },
              { label: "Lead", value: "lead" },
              { label: "Staff", value: "staff" },
              { label: "Prin", value: "principal" },
            ]}
          />
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <DatePickerInput
            type="range"
            label="Date range (posted_at)"
            placeholder="Pick dates"
            value={[state.range.from || null, state.range.to || null]}
            onChange={([from, to]) =>
              setState({
                ...state,
                range: { from, to },
                // if user sets a range, ignore quick 24h
                last24h: (from || to) ? false : state.last24h,
              })
            }
            leftSection={<IconCalendar size={16} />}
            clearable
            allowSingleDateInRange
          />
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 3 }}>
          <Tooltip label="Show only jobs posted in the last 24 hours">
            <Switch
              checked={state.last24h && !hasRange}
              onChange={(e) =>
                setState({
                  ...state,
                  last24h: e.currentTarget.checked,
                  // if enabling last24h, clear any date range
                  range: e.currentTarget.checked ? { from: null, to: null } : state.range,
                })
              }
              disabled={hasRange}
              label="Last 24h"
            />
          </Tooltip>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 3 }}>
          <Group justify="flex-end">
            <Button
              variant="default"
              leftSection={<IconX size={16} />}
              onClick={() => {
                const reset: FiltersState = {
                  q: "",
                  policy: "any",
                  seniority: "any",
                  last24h: false,
                  range: { from: null, to: null },
                };
                setState(reset);
                onReset?.();
              }}
            >
              Reset
            </Button>
            <Button
              onClick={() => onApply(state)}
              leftSection={<IconFilter size={16} />}
            >
              Apply
            </Button>
          </Group>
        </Grid.Col>
      </Grid>
    </Paper>
  );
}

// "use client";
// import { useEffect, useState } from "react";
// import { Button, Checkbox, Group, Select, TextInput, Paper } from "@mantine/core";

// type Props = {
//   onApply: (filters: { q: string; policy: string; seniority: string; last24h: boolean }) => void;
//   initial?: Partial<{ q: string; policy: string; seniority: string; last24h: boolean }>;
// };

// const POLICIES = ["any", "remote", "hybrid", "onsite"];
// const SENIORITY = ["any", "junior", "mid", "senior", "staff", "lead"];

// export default function Filters({ onApply, initial }: Props) {
//   const [q, setQ] = useState(initial?.q ?? "");
//   const [policy, setPolicy] = useState(initial?.policy ?? "any");
//   const [seniority, setSeniority] = useState(initial?.seniority ?? "any");
//   const [last24h, setLast24h] = useState(initial?.last24h ?? true);

//   useEffect(() => {
//     onApply({ q, policy, seniority, last24h });
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   return (
//     <Paper withBorder p="md" radius="md" mb="md" shadow="xs">
//       <Group align="end" wrap="wrap">
//         <TextInput
//           label="Keyword"
//           placeholder="e.g. ai engineer"
//           value={q}
//           onChange={(e) => setQ(e.currentTarget.value)}
//           style={{ flex: 1, minWidth: 240 }}
//         />
//         <Select
//           label="Policy"
//           value={policy}
//           onChange={(v) => setPolicy(v || "any")}
//           data={POLICIES}
//           style={{ width: 180 }}
//         />
//         <Select
//           label="Seniority"
//           value={seniority}
//           onChange={(v) => setSeniority(v || "any")}
//           data={SENIORITY}
//           style={{ width: 180 }}
//         />
//         <Checkbox
//           label="Last 24h"
//           checked={last24h}
//           onChange={(e) => setLast24h(e.currentTarget.checked)}
//           styles={{ root: { alignSelf: "center" } }}
//         />
//         <Button onClick={() => onApply({ q, policy, seniority, last24h })}>Apply</Button>
//       </Group>
//     </Paper>
//   );
// }

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
import { JobFilter } from "@/app/page"; // Import the type from the parent page

// This is the internal state used by the UI controls in this component
type FiltersState = {
  q: string;
  policy: "any" | "remote" | "hybrid" | "onsite";
  seniority: "any" | "junior" | "mid" | "senior" | "lead" | "staff" | "principal";
  last24h: boolean;
  // NOTE: The parent component does not support date range filtering from the API.
  // This UI element is preserved but will not affect the final search results.
  range: { from?: Date | null; to?: Date | null };
};

// Helper function to convert the parent's filter object to this component's internal state
function toInternalState(value: Partial<JobFilter>): FiltersState {
  let policy: FiltersState['policy'] = 'any';
  if (value.remote === 'true') {
    policy = 'remote';
  } else if (value.remote === 'false') {
    policy = 'onsite';
  }

  return {
    q: value.q ?? "",
    policy,
    seniority: (value.level as FiltersState['seniority']) ?? 'any',
    last24h: value.posted_within_hours === 24,
    range: { from: null, to: null }, // Parent does not support range, so default to null
  };
}

export default function Filters({
  value,
  onChange,
}: {
  value: JobFilter;
  onChange: (next: Partial<JobFilter>) => void;
}) {
  // The internal state is derived from the `value` prop passed by the parent
  const [state, setState] = useState<FiltersState>(() => toInternalState(value));

  // When the parent's `value` prop changes, we update our internal state to match
  useEffect(() => {
    setState(toInternalState(value));
  }, [value]);

  // This line no longer causes a crash because `state` is always initialized correctly
  const hasRange = !!state.range?.from || !!state.range?.to;

  const handleApply = () => {
    // When "Apply" is clicked, convert the internal state back to the parent's format
    const parentFilter: Partial<JobFilter> = {};

    parentFilter.q = state.q || null;
    parentFilter.level = state.seniority === 'any' ? null : state.seniority;
    parentFilter.posted_within_hours = state.last24h ? 24 : null;
    
    // Convert policy back to the 'remote' string/null that the parent expects
    if (state.policy === 'remote') {
      parentFilter.remote = 'true';
    } else if (state.policy === 'onsite') {
      parentFilter.remote = 'false';
    } else {
      // NOTE: 'hybrid' is not supported by the parent and will be treated as 'any'
      parentFilter.remote = null;
    }

    onChange(parentFilter);
  };

  const handleReset = () => {
    // When "Reset" is clicked, tell the parent to clear all active filters
    onChange({
      q: null,
      remote: null,
      level: null,
      posted_within_hours: null,
    });
  };

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
              onClick={handleReset}
            >
              Reset
            </Button>
            <Button
              onClick={handleApply}
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
// import {
//   Paper,
//   Group,
//   TextInput,
//   Button,
//   SegmentedControl,
//   Grid,
//   Switch,
//   Tooltip,
// } from "@mantine/core";
// import { DatePickerInput } from "@mantine/dates";
// import { IconCalendar, IconFilter, IconX } from "@tabler/icons-react";

// type DateRange = { from?: Date | null; to?: Date | null };

// type FiltersState = {
//   q: string;
//   policy: "any" | "remote" | "hybrid" | "onsite";
//   seniority: "any" | "junior" | "mid" | "senior" | "lead" | "staff" | "principal";
//   last24h: boolean;
//   range: DateRange;
// };

// export default function Filters({
//   initial,
//   onApply,
//   onReset,
// }: {
//   initial: FiltersState;
//   onApply: (f: FiltersState) => void;
//   onReset?: () => void;
// }) {
//   const [state, setState] = useState<FiltersState>(initial);

//   useEffect(() => setState(initial), [initial]);

//   const hasRange = !!state.range?.from || !!state.range?.to;

//   return (
//     <Paper withBorder radius="lg" p="md" mb="md">
//       <Grid gutter="md" align="end">
//         <Grid.Col span={{ base: 12, md: 4 }}>
//           <TextInput
//             label="Search"
//             placeholder="Keywords (company, title, text...)"
//             value={state.q}
//             onChange={(e) => setState({ ...state, q: e.currentTarget.value })}
//             leftSection={<IconFilter size={16} />}
//           />
//         </Grid.Col>

//         <Grid.Col span={{ base: 12, sm: 4, md: 3 }}>
//           <SegmentedControl
//             fullWidth
//             value={state.policy}
//             onChange={(v) => setState({ ...state, policy: v as FiltersState["policy"] })}
//             data={[
//               { label: "Any", value: "any" },
//               { label: "Remote", value: "remote" },
//               { label: "Hybrid", value: "hybrid" },
//               { label: "Onsite", value: "onsite" },
//             ]}
//           />
//         </Grid.Col>

//         <Grid.Col span={{ base: 12, sm: 4, md: 3 }}>
//           <SegmentedControl
//             fullWidth
//             value={state.seniority}
//             onChange={(v) => setState({ ...state, seniority: v as FiltersState["seniority"] })}
//             data={[
//               { label: "Any", value: "any" },
//               { label: "Jr", value: "junior" },
//               { label: "Mid", value: "mid" },
//               { label: "Sr", value: "senior" },
//               { label: "Lead", value: "lead" },
//               { label: "Staff", value: "staff" },
//               { label: "Prin", value: "principal" },
//             ]}
//           />
//         </Grid.Col>

//         <Grid.Col span={{ base: 12, md: 6 }}>
//           <DatePickerInput
//             type="range"
//             label="Date range (posted_at)"
//             placeholder="Pick dates"
//             value={[state.range.from || null, state.range.to || null]}
//             onChange={([from, to]) =>
//               setState({
//                 ...state,
//                 range: { from, to },
//                 // if user sets a range, ignore quick 24h
//                 last24h: (from || to) ? false : state.last24h,
//               })
//             }
//             leftSection={<IconCalendar size={16} />}
//             clearable
//             allowSingleDateInRange
//           />
//         </Grid.Col>

//         <Grid.Col span={{ base: 12, md: 3 }}>
//           <Tooltip label="Show only jobs posted in the last 24 hours">
//             <Switch
//               checked={state.last24h && !hasRange}
//               onChange={(e) =>
//                 setState({
//                   ...state,
//                   last24h: e.currentTarget.checked,
//                   // if enabling last24h, clear any date range
//                   range: e.currentTarget.checked ? { from: null, to: null } : state.range,
//                 })
//               }
//               disabled={hasRange}
//               label="Last 24h"
//             />
//           </Tooltip>
//         </Grid.Col>

//         <Grid.Col span={{ base: 12, md: 3 }}>
//           <Group justify="flex-end">
//             <Button
//               variant="default"
//               leftSection={<IconX size={16} />}
//               onClick={() => {
//                 const reset: FiltersState = {
//                   q: "",
//                   policy: "any",
//                   seniority: "any",
//                   last24h: false,
//                   range: { from: null, to: null },
//                 };
//                 setState(reset);
//                 onReset?.();
//               }}
//             >
//               Reset
//             </Button>
//             <Button
//               onClick={() => onApply(state)}
//               leftSection={<IconFilter size={16} />}
//             >
//               Apply
//             </Button>
//           </Group>
//         </Grid.Col>
//       </Grid>
//     </Paper>
//   );
// }

// // "use client";
// // import { useEffect, useState } from "react";
// // import { Button, Checkbox, Group, Select, TextInput, Paper } from "@mantine/core";

// // type Props = {
// //   onApply: (filters: { q: string; policy: string; seniority: string; last24h: boolean }) => void;
// //   initial?: Partial<{ q: string; policy: string; seniority: string; last24h: boolean }>;
// // };

// // const POLICIES = ["any", "remote", "hybrid", "onsite"];
// // const SENIORITY = ["any", "junior", "mid", "senior", "staff", "lead"];

// // export default function Filters({ onApply, initial }: Props) {
// //   const [q, setQ] = useState(initial?.q ?? "");
// //   const [policy, setPolicy] = useState(initial?.policy ?? "any");
// //   const [seniority, setSeniority] = useState(initial?.seniority ?? "any");
// //   const [last24h, setLast24h] = useState(initial?.last24h ?? true);

// //   useEffect(() => {
// //     onApply({ q, policy, seniority, last24h });
// //     // eslint-disable-next-line react-hooks/exhaustive-deps
// //   }, []);

// //   return (
// //     <Paper withBorder p="md" radius="md" mb="md" shadow="xs">
// //       <Group align="end" wrap="wrap">
// //         <TextInput
// //           label="Keyword"
// //           placeholder="e.g. ai engineer"
// //           value={q}
// //           onChange={(e) => setQ(e.currentTarget.value)}
// //           style={{ flex: 1, minWidth: 240 }}
// //         />
// //         <Select
// //           label="Policy"
// //           value={policy}
// //           onChange={(v) => setPolicy(v || "any")}
// //           data={POLICIES}
// //           style={{ width: 180 }}
// //         />
// //         <Select
// //           label="Seniority"
// //           value={seniority}
// //           onChange={(v) => setSeniority(v || "any")}
// //           data={SENIORITY}
// //           style={{ width: 180 }}
// //         />
// //         <Checkbox
// //           label="Last 24h"
// //           checked={last24h}
// //           onChange={(e) => setLast24h(e.currentTarget.checked)}
// //           styles={{ root: { alignSelf: "center" } }}
// //         />
// //         <Button onClick={() => onApply({ q, policy, seniority, last24h })}>Apply</Button>
// //       </Group>
// //     </Paper>
// //   );
// // }

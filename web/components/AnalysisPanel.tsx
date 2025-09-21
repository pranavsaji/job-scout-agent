"use client";
import { Card, Text, Group, Progress, List, ThemeIcon, Badge } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";

export default function AnalysisPanel({
  result,
}: {
  result: {
    fit_score: number;
    strengths: string[];
    gaps: string[];
    ats_keywords: string[];
    rationale: string;
  } | null;
}) {
  if (!result) return null;
  return (
    <Card withBorder radius="md" shadow="xs">
      <Group justify="space-between" mb="sm">
        <Text fw={600}>Fit analysis</Text>
        <Group gap="xs" align="center">
          <Text size="sm" c="dimmed">Fit score</Text>
          <Text fw={700}>{result.fit_score}</Text>
        </Group>
      </Group>
      <Progress value={result.fit_score} size="lg" mb="md" />

      <Group align="start" grow mb="md">
        <div>
          <Text fw={600} mb={6}>Strengths</Text>
          <List
            spacing="xs"
            icon={
              <ThemeIcon size={18} radius="xl" color="green">
                <IconCheck size={12} />
              </ThemeIcon>
            }
          >
            {result.strengths?.map((s, i) => <List.Item key={i}>{s}</List.Item>)}
          </List>
        </div>
        <div>
          <Text fw={600} mb={6}>Gaps</Text>
          <List spacing="xs">
            {result.gaps?.map((g, i) => <List.Item key={i}>{g}</List.Item>)}
          </List>
        </div>
      </Group>

      <Text fw={600} mb={6}>ATS keywords</Text>
      <Group gap="xs" mb="md">
        {result.ats_keywords?.map((k, i) => (
          <Badge key={i} variant="light">{k}</Badge>
        ))}
      </Group>

      <Text c="dimmed" size="sm">{result.rationale}</Text>
    </Card>
  );
}

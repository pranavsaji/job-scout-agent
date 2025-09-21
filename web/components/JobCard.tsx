"use client";

import Link from "next/link";
import { Card, Text, Badge, Group, Button } from "@mantine/core";
import type { Job } from "@/lib/api";
import { excerptFromHtml } from "@/lib/html";

export default function JobCard({ job }: { job: Job }) {
  const snippet = excerptFromHtml(job.description_md, 300);

  return (
    <Card withBorder radius="lg" shadow="sm" className="h-80 flex flex-col overflow-hidden">
      {/* Header */}
      <Group justify="space-between" mb="xs">
        <div className="min-w-0">
          <Text fw={600} size="sm" c="dimmed" className="truncate">
            {job.company}
          </Text>
          <Text fw={700} className="truncate">{job.title}</Text>
        </div>
        <Badge variant="light" className="shrink-0">
          {job.location ?? "N/A"}
        </Badge>
      </Group>

      {/* Snippet area — fixed space */}
      <div className="flex-1 text-sm text-gray-700 overflow-hidden">
        <p className="clamp-5">{snippet}</p>
      </div>

      {/* Actions */}
      <Group mt="md" gap="sm">
        <Button
          component="a"
          href={job.apply_url}
          target="_blank"
          rel="noopener noreferrer"
          size="xs"
        >
          Apply
        </Button>
        <Button
          variant="light"
          size="xs"
          component={Link}
          href={`/job/${job.id}`}
        >
          View details
        </Button>
      </Group>
    </Card>
  );
}

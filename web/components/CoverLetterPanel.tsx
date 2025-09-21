"use client";
import { useState } from "react";
import { Card, Textarea, Group, Button, Select } from "@mantine/core";

export default function CoverLetterPanel({
  letter,
  onVariant,
  onCopy,
  onChange,
}: {
  letter: string;
  onVariant: (v: "short" | "standard" | "long") => void;
  onCopy: () => void;
  onChange: (t: string) => void;
}) {
  const [variant, setVariant] = useState<"short" | "standard" | "long">("standard");

  return (
    <Card withBorder radius="md" shadow="xs">
      <Group justify="space-between" mb="xs">
        <Select
          label="Variant"
          value={variant}
          onChange={(v) => {
            const vv = (v || "standard") as "short" | "standard" | "long";
            setVariant(vv);
            onVariant(vv);
          }}
          data={["short", "standard", "long"]}
          style={{ width: 180 }}
        />
        <Button variant="light" onClick={onCopy}>Copy</Button>
      </Group>
      <Textarea
        minRows={14}
        autosize
        value={letter}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    </Card>
  );
}

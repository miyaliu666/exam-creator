import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  createLanguageItemStagingAssembly,
  getLanguageItemAssemblies,
} from "./api";
import type { LanguageItem } from "./types";

interface AssemblyPanelProps {
  items: LanguageItem[];
}

export function AssemblyPanel({ items }: AssemblyPanelProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("Signs and Short Notices Test");
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const assembliesQuery = useQuery({
    queryKey: ["language-item-assemblies"],
    queryFn: getLanguageItemAssemblies,
    retry: false,
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createLanguageItemStagingAssembly({ title, versionIds: selectedVersionIds }),
    onSuccess: async (assembly) => {
      setNotice(`Test created with ${assembly.sources.length} items.`);
      await queryClient.invalidateQueries({
        queryKey: ["language-item-assemblies"],
      });
    },
  });
  const eligibleItems = items.filter(
    (item) =>
      item.status === "exportedToStaging" &&
      item.latestVersionId &&
      item.draft.blueprintSlotId === "R-A1-1",
  );
  const toggle = (versionId: string) => {
    setNotice(null);
    setSelectedVersionIds((current) =>
      current.includes(versionId)
        ? current.filter((id) => id !== versionId)
        : current.length < 6
          ? [...current, versionId]
          : current,
    );
  };
  const canAssemble =
    title.trim().length > 0 &&
    selectedVersionIds.length >= 5 &&
    selectedVersionIds.length <= 6;

  return (
    <Box borderWidth="1px" borderRadius="xl" p={6}>
      <Stack gap={5}>
        <Box>
          <Heading size="lg">Assemble a Signs, Labels, and Short Notices test</Heading>
        </Box>
        <Input
          aria-label="Test title"
          placeholder="Enter a test title"
          value={title}
          onChange={(event) => {
            setNotice(null);
            setTitle(event.target.value);
          }}
        />
        {eligibleItems.length === 0 ? (
          <Box borderWidth="1px" borderRadius="lg" p={5}>
            <Text fontWeight="semibold">No eligible items</Text>
          </Box>
        ) : (
          <Stack gap={2}>
            {eligibleItems.map((item) => {
              const versionId = item.latestVersionId;
              if (!versionId) return null;
              const selected = selectedVersionIds.includes(versionId);
              return (
                <Box
                  as="label"
                  key={versionId}
                  borderWidth="1px"
                  borderRadius="md"
                  p={3}
                  cursor="pointer"
                  bg={selected ? "bg.info" : undefined}
                >
                  <HStack align="start">
                    <input
                      aria-label={`Select ${item.title}`}
                      type="checkbox"
                      checked={selected}
                      disabled={!selected && selectedVersionIds.length >= 6}
                      onChange={() => toggle(versionId)}
                    />
                    <Stack gap={0} minW={0}>
                      <Text fontWeight="semibold">{item.title}</Text>
                      <Text fontSize="xs" color="fg.muted">Reviewed and exported</Text>
                    </Stack>
                  </HStack>
                </Box>
              );
            })}
          </Stack>
        )}
        <HStack justify="space-between" flexWrap="wrap">
          <Text color="fg.muted">Selected {selectedVersionIds.length} / 5–6 items</Text>
          <Button
            colorPalette="teal"
            disabled={!canAssemble}
            loading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Create Staging test
          </Button>
        </HStack>
        {notice ? <Text color="fg.success">{notice}</Text> : null}
        {createMutation.isError ? (
          <Text color="fg.error">{createMutation.error.message}</Text>
        ) : null}
        <Box>
          <Heading size="sm" mb={2}>Recently created tests</Heading>
          {assembliesQuery.isPending ? (
            <Text color="fg.muted">Loading…</Text>
          ) : assembliesQuery.isError ? (
            <Text color="fg.error">{assembliesQuery.error.message}</Text>
          ) : assembliesQuery.data.length === 0 ? (
            <Text color="fg.muted">No tests have been created yet.</Text>
          ) : (
            <Stack gap={2}>
              {assembliesQuery.data.map((assembly) => (
                <Box key={assembly.id} borderWidth="1px" borderRadius="md" p={3}>
                  <HStack justify="space-between" align="start" flexWrap="wrap">
                    <Box>
                      <Text fontWeight="semibold">{assembly.title}</Text>
                      <Box as="details" fontSize="xs" color="fg.muted">
                        <Box as="summary" cursor="pointer">View internal mappings</Box>
                        <Text mt={1}>
                          Assembly {assembly.id} · compatible exam {assembly.legacyExamId}
                        </Text>
                      </Box>
                    </Box>
                    <Badge colorPalette="teal">{assembly.sources.length} items</Badge>
                  </HStack>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Box>
  );
}

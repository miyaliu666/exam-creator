import { Button, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

import { authorizedFetch } from "../../utils/fetch";

export function VersionAssemblyDownload({ itemId, versionId, versionNumber, disabled }: {
  itemId: string;
  versionId: string;
  versionNumber: number;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await authorizedFetch(`/api/language-items/${encodeURIComponent(itemId)}/versions/${encodeURIComponent(versionId)}/assembly-manifest`);
      const manifest: unknown = await response.json();
      const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `assembly-version-${versionNumber}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The assembly manifest could not be downloaded.");
    } finally {
      setPending(false);
    }
  };
  return <Stack align="start" gap={1}>
    <Button size="sm" variant="outline" loading={pending} disabled={disabled} onClick={() => { void download(); }}>
      Download assembly manifest
    </Button>
    <Text fontSize="xs" color="fg.muted">Version, assembly criteria and current availability. No answers or exam deployment.</Text>
    {error ? <Text role="alert" color="fg.error" fontSize="sm">{error}</Text> : null}
  </Stack>;
}

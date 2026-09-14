import { Box, Button, Center, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { createRoute, useNavigate } from "@tanstack/react-router";
import { useContext, useEffect, useState } from "react";

import { ProtectedRoute } from "../components/protected-route";
import { Header } from "../components/ui/header";
import { AuthContext } from "../contexts/auth";
import { SignOutButton } from "../components/sign-out-button";
import { UsersWebSocketActivityContext } from "../contexts/users-websocket";
import { getLanguageItemRegistry } from "../features/language-items/api";
import { LanguageCoveragePanel } from "../features/language-items/coverage-panel";
import { saveCreationSuggestion } from "../features/language-items/creation-suggestion-storage";
import type { RegistrySnapshot } from "../features/language-items/types";
import { rootRoute } from "./root";

function LanguageItemCoverage() {
  const { user, logout } = useContext(AuthContext)!;
  const { updateActivity } = useContext(UsersWebSocketActivityContext)!;
  const navigate = useNavigate();
  const [entryRegistry, setEntryRegistry] = useState<RegistrySnapshot>();
  const registry = useQuery({
    queryKey: ["language-item-registry"],
    queryFn: () => getLanguageItemRegistry(),
    enabled: !!user,
    refetchOnMount: "always",
  });
  useEffect(() => {
    // Pin this visit after checking Current; later background publications must not reset an analysis.
    if (!entryRegistry && registry.data && !registry.isFetching && !registry.error) setEntryRegistry(registry.data);
  }, [entryRegistry, registry.data, registry.isFetching, registry.error]);
  useEffect(() => { updateActivity({ page: new URL(window.location.href), lastActive: Date.now() }); }, []);
  return (
    <Box minH="100vh" bg="bg" py={12} px={4}>
      <HStack position="fixed" top={3} left={8} zIndex={101} gap={3}>
        <Button variant="outline" colorPalette="teal" size="sm" onClick={() => navigate({ to: "/language-items" })}>Item Bank</Button>
        <SignOutButton variant="outline" colorPalette="red" size="sm" onClick={logout}>Sign out / switch account</SignOutButton>
      </HStack>
      <Center>
        <Stack gap={6} w="full" maxW="7xl">
          <Header title="Language coverage" />
          {!entryRegistry && !registry.error && <HStack><Spinner size="sm" /><Text>Loading Assessment Settings…</Text></HStack>}
          {!entryRegistry && registry.error && <Stack role="alert"><Text color="red.600">{registry.error.message}</Text><Button alignSelf="start" variant="outline" onClick={() => void registry.refetch()}>Retry</Button></Stack>}
          {entryRegistry && <LanguageCoveragePanel key={user?.email} registry={entryRegistry} accountScope={user?.email ?? "local"} onPlanBatch={(suggestion) => {
            saveCreationSuggestion(user?.email ?? "local", suggestion);
            void navigate({ to: "/language-items/new" });
          }} />}
        </Stack>
      </Center>
    </Box>
  );
}

export const languageItemCoverageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/language-items/coverage",
  component: () => <ProtectedRoute><LanguageItemCoverage /></ProtectedRoute>,
});

import { Box, Button, Center, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { createRoute, useNavigate } from "@tanstack/react-router";
import { useContext, useEffect } from "react";

import { ProtectedRoute } from "../components/protected-route";
import { Header } from "../components/ui/header";
import { AuthContext } from "../contexts/auth";
import { UsersWebSocketActivityContext } from "../contexts/users-websocket";
import { getLanguageItemRegistry } from "../features/language-items/api";
import { LanguageCoveragePanel } from "../features/language-items/coverage-panel";
import { saveCreationSuggestion } from "../features/language-items/creation-suggestion-storage";
import { rootRoute } from "./root";

function LanguageItemCoverage() {
  const { user, logout } = useContext(AuthContext)!;
  const { updateActivity } = useContext(UsersWebSocketActivityContext)!;
  const navigate = useNavigate();
  const registry = useQuery({
    queryKey: ["language-item-registry"],
    queryFn: () => getLanguageItemRegistry(),
    enabled: !!user,
  });
  useEffect(() => { updateActivity({ page: new URL(window.location.href), lastActive: Date.now() }); }, []);
  return (
    <Box minH="100vh" bg="bg" py={12} px={4}>
      <HStack position="fixed" top={3} left={8} zIndex={101} gap={3}>
        <Button variant="outline" colorPalette="teal" size="sm" onClick={() => navigate({ to: "/language-items" })}>Item bank</Button>
        <Button variant="outline" colorPalette="red" size="sm" onClick={logout}>Sign out / switch account</Button>
      </HStack>
      <Center>
        <Stack gap={6} w="full" maxW="7xl">
          <Header title="Language coverage"><Button colorPalette="teal" onClick={() => navigate({ to: "/language-items/new" })}>New items</Button></Header>
          {registry.isPending && <HStack><Spinner size="sm" /><Text>Loading Assessment Settings…</Text></HStack>}
          {registry.error && <Stack role="alert"><Text color="red.600">{registry.error.message}</Text><Button alignSelf="start" variant="outline" onClick={() => void registry.refetch()}>Retry</Button></Stack>}
          {registry.data && <LanguageCoveragePanel key={user?.email} registry={registry.data} onPlanBatch={(suggestion) => {
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

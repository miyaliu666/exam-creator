import { Box, Button, Center, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { createRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useContext, useEffect } from "react";

import { ProtectedRoute } from "../components/protected-route";
import { Header } from "../components/ui/header";
import { AuthContext } from "../contexts/auth";
import { UsersWebSocketActivityContext } from "../contexts/users-websocket";
import { getLanguageItemRegistry } from "../features/language-items/api";
import { BatchAuthoringPanel } from "../features/language-items/batch-authoring-panel";
import { editLanguageItemRoute } from "./edit-language-item";
import { rootRoute } from "./root";

function LanguageItemBatches() {
  const { user, logout } = useContext(AuthContext)!;
  const { updateActivity } = useContext(UsersWebSocketActivityContext)!;
  const navigate = useNavigate();
  const { batchId } = languageItemBatchesRoute.useSearch();
  const registryQuery = useQuery({
    queryKey: ["language-item-registry"],
    queryFn: () => getLanguageItemRegistry(),
    enabled: !!user,
    retry: false,
  });
  useEffect(() => { updateActivity({ page: new URL(window.location.href), lastActive: Date.now() }); }, []);

  return (
    <Box minH="100vh" bg="bg" py={12} px={4}>
      <HStack position="fixed" top={3} left={8} zIndex={101} gap={3}>
        <Button variant="outline" colorPalette="teal" size="sm" onClick={() => navigate({ to: "/language-items" })}>Item Bank</Button>
        <Button variant="outline" colorPalette="red" size="sm" onClick={() => logout()}>Sign out / switch account</Button>
      </HStack>
      <Center>
        <Stack gap={6} w="full" maxW="7xl">
          <Header title="Generation jobs">
            <Button colorPalette="teal" onClick={() => navigate({ to: "/language-items/new" })}>
              <Plus size={18} /> New items
            </Button>
          </Header>
          {registryQuery.data ? <BatchAuthoringPanel key={user?.email ?? "local"}
            scope={user?.email ?? "local"} registry={registryQuery.data} focusedJobId={batchId}
            onOpenItem={(id) => navigate({ to: editLanguageItemRoute.to, params: { id } })} /> : null}
          {registryQuery.isPending ? <Spinner /> : null}
          {registryQuery.error ? <HStack flexWrap="wrap">
            <Text role="alert" color="fg.error">Could not load Assessment Settings: {registryQuery.error.message}</Text>
            <Button size="sm" variant="outline" loading={registryQuery.isFetching} onClick={() => void registryQuery.refetch()}>Retry</Button>
          </HStack> : null}
        </Stack>
      </Center>
    </Box>
  );
}

export const languageItemBatchesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/language-items/batches",
  validateSearch: (search: Record<string, unknown>): { batchId?: string } => ({
    batchId: typeof search.batchId === "string" ? search.batchId : undefined,
  }),
  component: () => <ProtectedRoute><LanguageItemBatches /></ProtectedRoute>,
});

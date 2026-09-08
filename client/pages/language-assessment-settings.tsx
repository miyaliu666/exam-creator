import { Box, Button, Center, HStack, Stack } from "@chakra-ui/react";
import { createRoute, useNavigate } from "@tanstack/react-router";
import { useContext, useEffect, useState } from "react";

import { ProtectedRoute } from "../components/protected-route";
import { Header } from "../components/ui/header";
import { AuthContext } from "../contexts/auth";
import { UsersWebSocketActivityContext } from "../contexts/users-websocket";
import { RegistrySettingsPanel } from "../features/language-items/registry-settings-panel";
import { rootRoute } from "./root";

function LanguageAssessmentSettings() {
  const { user, logout } = useContext(AuthContext)!;
  const { updateActivity } = useContext(UsersWebSocketActivityContext)!;
  const navigate = useNavigate();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { updateActivity({ page: new URL(window.location.href), lastActive: Date.now() }); }, []);
  return (
    <Box minH="100vh" bg="bg" py={12} px={4}>
      <HStack position="fixed" top={3} left={8} zIndex={101} gap={3}>
        <Button variant="outline" colorPalette="teal" size="sm" disabled={busy} onClick={() => navigate({ to: "/language-items" })}>Item bank</Button>
        <Button variant="outline" colorPalette="red" size="sm" disabled={busy} onClick={() => {
          if (!dirty || window.confirm("Discard unsaved settings and sign out?")) logout();
        }}>Sign out / switch account</Button>
      </HStack>
      <Center>
        <Stack gap={6} w="full" maxW="7xl">
          <Header title="Assessment Settings" />
          <RegistrySettingsPanel key={user?.email} onDirtyChange={setDirty} onBusyChange={setBusy} />
        </Stack>
      </Center>
    </Box>
  );
}

export const languageAssessmentSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/language-items/assessment-settings",
  component: () => <ProtectedRoute><LanguageAssessmentSettings /></ProtectedRoute>,
});

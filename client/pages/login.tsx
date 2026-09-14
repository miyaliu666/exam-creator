import { createRoute, useNavigate, useSearch } from "@tanstack/react-router";
import {
  Box,
  Button,
  Center,
  Heading,
  Stack,
  Text,
  Spinner,
  Alert,
  CloseButton,
} from "@chakra-ui/react";

import { rootRoute } from "./root";
import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../contexts/auth";
import { landingRoute } from "./landing";
import { DevSignInOptions } from "../components/dev-sign-in-options";

export function Login() {
  const navigate = useNavigate();
  const search = useSearch({ from: loginRoute.fullPath });
  const { login, user, isLoading, isPublicAccess } = useContext(AuthContext)!;

  const [error, setError] = useState<string | null>(search.error);

  useEffect(() => {
    if (user) {
      navigate({ to: landingRoute.to });
    }
  }, [user]);

  return (
    <Box minH="100vh">
      <Center minH="100vh">
        <Stack
          gap={8}
          w="full"
          maxW="md"
          borderRadius="xl"
          boxShadow="lg"
          p={8}
          align="center"
        >
          {error && (
            <Alert.Root status="error" borderRadius="md">
              <Alert.Indicator />
              <Text flex="1">{error}</Text>
              <CloseButton
                onClick={() => setError(null)}
                position="absolute"
                right="8px"
                top="8px"
              />
            </Alert.Root>
          )}
          {isLoading || isPublicAccess ? (
            <>
              <Text fontWeight="bold" fontSize="xl">
                Loading workspace...
              </Text>
              <Spinner color={"teal.focusRing"} size="xl" />
            </>
          ) : (
            <>
              <Heading fontWeight="extrabold" fontSize="2xl">
                Sign in
              </Heading>
              <Text fontSize="md">Choose an identity to continue.</Text>
              <Button
                colorPalette="teal"
                size="lg"
                fontWeight="bold"
                onClick={login}
                px={8}
              >
                Continue with GitHub
              </Button>
              <DevSignInOptions />
            </>
          )}
        </Stack>
      </Center>
    </Box>
  );
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: Login,
});

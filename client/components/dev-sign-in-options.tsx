import {
  Alert,
  Box,
  Button,
  Field,
  Heading,
  Input,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useContext, useState } from "react";
import { getDevLoginStatus, loginWithDevIdentity } from "../utils/fetch";
import { AuthContext } from "../contexts/auth";

const presetUsers = [
  {
    name: "Local User",
    email: "author@exam-creator.local",
    label: "Continue as local user",
  },
] as const;

export function DevSignInOptions() {
  const auth = useContext(AuthContext);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const statusQuery = useQuery({
    queryKey: ["dev-login-status"],
    queryFn: getDevLoginStatus,
    retry: false,
    enabled: !auth?.isPublicAccess,
  });

  const signinMutation = useMutation({
    mutationFn: loginWithDevIdentity,
    retry: false,
    onSuccess: () => {
      window.location.reload();
    },
  });

  if (auth?.isPublicAccess || statusQuery.data?.enabled !== true) {
    return null;
  }

  return (
    <Box w="full" mt={2} borderTopWidth="1px" pt={6}>
      <Heading as="h3" size="md" mb={2}>
        Local development identities
      </Heading>
      <Text color="fg.muted" fontSize="sm" mb={4}>
        The same local identity can maintain assessment settings, generate and edit items, and complete review gates.
      </Text>
      <Stack gap={4}>
        <SimpleGrid columns={{ base: 1, sm: 2 }} gap={3}>
          {presetUsers.map((preset) => (
            <Button
              key={preset.email}
              variant="outline"
              colorPalette="teal"
              loading={
                signinMutation.isPending &&
                signinMutation.variables?.email === preset.email
              }
              onClick={() => signinMutation.mutate(preset)}
            >
              {preset.label}
            </Button>
          ))}
        </SimpleGrid>
        {signinMutation.isError ? (
          <Alert.Root status="error">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>
                {signinMutation.error.message}
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        ) : null}
        <Box as="details">
          <Box as="summary" cursor="pointer" fontSize="sm" color="fg.muted">
            Use a custom test identity
          </Box>
          <Stack gap={3} mt={3}>
            <Field.Root>
              <Field.Label>Name</Field.Label>
              <Input
                placeholder="Example: Test user 2"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field.Root>
            <Field.Root>
              <Field.Label>Email</Field.Label>
              <Input
                type="email"
                placeholder="user2@example.test"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field.Root>
            <Button
              colorPalette="teal"
              disabled={!name.trim() || !email.includes("@")}
              loading={
                signinMutation.isPending &&
                signinMutation.variables?.email === email
              }
              onClick={() => signinMutation.mutate({ name, email })}
            >
              Continue with this identity
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

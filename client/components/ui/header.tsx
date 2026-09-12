import { Flex, Heading, Stack, Text } from "@chakra-ui/react";
import { ReactNode } from "react";
import { UsersOnPageAvatars } from "../users-on-page-avatars";

interface HeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export function Header({
  title,
  description,
  children,
}: HeaderProps) {
  const page = window.location.pathname.split("/")[1];
  const showPresence = ["exams", "attempts", "metrics", "users", "user"].includes(page);

  return (
    <Flex
      justify="space-between"
      align="center"
      bg={"bg"}
      borderRadius="xl"
      p={4}
      boxShadow="lg"
      mb={2}
    >
      <Stack gap={1}>
        <Heading color={"fg.info"} fontWeight="extrabold" fontSize="3xl">
          {title}
        </Heading>
        {description && (
          <Text color="fg.muted" fontSize="lg">
            {description}
          </Text>
        )}
      </Stack>
      {showPresence ? <UsersOnPageAvatars path={"/" + page} /> : null}
      {children}
    </Flex>
  );
}

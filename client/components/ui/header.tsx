import { Flex, Heading, Stack, Text } from "@chakra-ui/react";
import { ReactNode } from "react";

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
      {children}
    </Flex>
  );
}

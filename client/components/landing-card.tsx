import { Card, Flex, Text } from "@chakra-ui/react";
import { ReactNode } from "react";

interface LandingCardProps {
  children: ReactNode;
}

export function LandingCard({ children }: LandingCardProps) {
  return (
    <Card.Root
      borderRadius="xl"
      boxShadow="md"
      px={4}
      py={3}
      h="100%"
      minH="120px"
      _hover={{ borderColor: "border.info", boxShadow: "lg" }}
      borderWidth={2}
      borderColor="transparent"
      transition="all 0.15s"
    >
      <Card.Header pb={2} pt={0} pl={0}>
        <Flex align="center" justify="space-between">
          <Text
            fontSize="xl"
            fontWeight="bold"
            color={"fg.info"}
            maxW="80%"
            minW={0}
            lineHeight="1.4"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
          >
            {children}
          </Text>
        </Flex>
      </Card.Header>
    </Card.Root>
  );
}

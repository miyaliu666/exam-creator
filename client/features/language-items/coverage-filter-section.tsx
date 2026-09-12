import { Box, Button, HStack, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

export function CoverageFilterSection({ children, onReset }: { children: ReactNode; onReset?: () => void }) {
  return <Box as="section" aria-label="Coverage filters" borderWidth="1px" borderRadius="lg" p={4}>
    <Stack gap={3}>
      <HStack justify="space-between">
        <Text fontWeight="medium">Filters</Text>
        {onReset && <Button size="xs" variant="ghost" onClick={onReset}>Reset</Button>}
      </HStack>
      {children}
    </Stack>
  </Box>;
}

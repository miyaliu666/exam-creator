import { Badge, Box, Link, Stack, Text } from "@chakra-ui/react";

const SOURCES = [
  { title: "CEFR descriptors", url: "https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-descriptors-search", purpose: "Can-do and communicative activity reference. A Chinese vocabulary list or a CEFR equivalence claim needs separate evidence." },
  { title: "Chinese Proficiency Grading Standards for International Chinese Language Education · GF0025-2021", url: "https://hudong.moe.gov.cn/jyb_sjzl/ziliao/A19/202111/t20211118_580755.html", purpose: "Chinese language elements and level descriptions. Its levels are not automatically equivalent to this project's A1." },
  { title: "TBCL · Taiwan Benchmarks for the Chinese Language", url: "https://coct.naer.edu.tw/", purpose: "Word, grammar and proficiency references. Check language variety, edition and the intended learner group." },
  { title: "BCC · Beijing Language and Culture University Corpus", url: "https://bcc.blcu.edu.cn/", purpose: "Use examples and context. Choose the relevant spoken or written corpus; general frequency does not establish A1 difficulty." },
  { title: "HSK official resources", url: "https://admin.chinesetest.cn/godownload.do", purpose: "Published exam specifications and examples for design research. Do not use existing questions as rewrite templates." },
  { title: "TOCFL official resources", url: "https://tocfl.edu.tw/tocfl/index.php/teach/test/page/1", purpose: "Task design and public examples. Verify permission for each intended use before copying or importing materials." },
];

export function ReferenceSourcesPanel() {
  return <Stack gap={4}>
    <Text fontWeight="semibold">Reference sources</Text>
    <Text fontSize="sm" color="fg.muted">Free public reference links for author research. These sources have not been imported into AI generation. Their availability does not grant permission to copy, adapt or deliver their content.</Text>
    {SOURCES.map((source) => <Box key={source.url} borderWidth="1px" borderRadius="md" p={3}>
      <Link href={source.url} target="_blank" rel="noopener noreferrer" fontWeight="medium">{source.title}</Link>
      <Text fontSize="sm" mt={1}>{source.purpose}</Text>
      <Badge mt={2} variant="subtle">Reference link · reuse permission not verified</Badge>
    </Box>)}
    <Text fontSize="sm" color="fg.muted">The author decides which evidence supports the published project rules. Saving or publishing settings records project decisions; it does not certify the examination.</Text>
  </Stack>;
}

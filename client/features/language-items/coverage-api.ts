import { authorizedFetch } from "../../utils/fetch";
import type { CoverageRequest, CoverageResponse } from "./coverage-types";

export async function getLanguageCoverage(request: CoverageRequest): Promise<CoverageResponse> {
  const response = await authorizedFetch("/api/language-item-coverage/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return response.json() as Promise<CoverageResponse>;
}

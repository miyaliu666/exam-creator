import { contextIsOptional, contextsForCapability, domainsForCapability } from "./registry-capability";
import type { RegistryCapability, RegistrySnapshot } from "./types";

/** A query value, never a stored Context identity. Empty filters still mean no filter. */
export const NO_CONTEXT_FILTER = "__NO_CONTEXT__";

export function coverageContextsForCapability(registry: RegistrySnapshot, capability: RegistryCapability) {
  const contexts = contextsForCapability(registry, capability)
    .filter((context) => capability.allowedDomains.includes(context.primaryDomains[0]))
    .map((context) => ({ id: context.id, domain: context.primaryDomains[0] }));
  return contextIsOptional(registry, capability)
    ? [...domainsForCapability(registry, capability).map((domain) => ({ id: "", domain })), ...contexts]
    : contexts;
}

export function coverageContextMatchesFilter(contextId: string, filter?: string) {
  return !filter || filter === (contextId || NO_CONTEXT_FILTER);
}

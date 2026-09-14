# Archived migration inputs

The v0.2 source definitions here are retained only as migration provenance. Current application loading uses `rules/a1-item-rule-registry-v0.3.yaml`; it must never load these definitions as runtime entities.

`migrate-workbench-assets.cjs` reproduces the 21 current item rules from the archived inputs. Migrated IDs are `legacy-rule-` plus lowercase SHA-256 of UTF-8 compact JSON `[old identity, item format, primary Can-do]`. Source Exercise Template rules use their existing rule ID directly. The migration preserves shared scoring and task-family relationships through `itemRuleIds` arrays, and writes delivery policies explicitly rather than inferring behavior from identifiers.

Historical published snapshots, submitted review assets and content hashes remain immutable. Their reading and validation use explicit historical adapters; this source migration does not rewrite stored records.

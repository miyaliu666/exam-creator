# Language Exam Item Creator

This directory contains the Workbench's versioned machine-readable contracts and registries.

- `contracts/` contains compile-time data contracts that are required to build the Rust server.
- `registries/` contains the machine-readable Blueprint, Can-do, context, content, format, scoring, review, and delivery contracts. The Rust server embeds the runtime subset at compile time.

The runtime implementation remains in `server/language_items/`, `server/routes/language_item_*.rs`, and `client/features/language-items/`.

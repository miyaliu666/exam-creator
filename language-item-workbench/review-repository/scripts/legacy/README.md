# Historical pinned reviews

These validators implement the immutable TaskPackage 0.1 contract for submissions created before Item rule identity. `pinned-validation.mjs` is the only entry point. The review runner verifies protected asset bytes before selecting this path, then validates the original package without converting its identity or changing its content hash. Current TaskPackage 0.2 submissions cannot enter this path. These modules do not create settings, items or current runtime definitions.

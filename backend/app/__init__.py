"""EnergiCast API package."""
import os

# Memory: use the system allocator for Arrow (pandas string columns) instead of its private mimalloc pool, so freed
# memory can be handed back to the OS by malloc_trim() after heavy jobs. Must be set before pyarrow is imported.
os.environ.setdefault("ARROW_DEFAULT_MEMORY_POOL", "system")

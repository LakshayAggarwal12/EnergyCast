"""Memory discipline for a small (512 MB) instance.

* `heavy_job` lets only ONE memory-hungry task (validate / process / train / large downloads) run at a time, so two
  background jobs can never add up past the limit; the second simply waits its turn.
* After each job, Python garbage is collected and glibc is asked to hand freed memory back to the OS
  (otherwise the process RSS, which is what Render measures, stays high after big numpy/pandas allocations).
"""
from __future__ import annotations

import ctypes
import gc
import logging
import sys
import threading
from contextlib import contextmanager

log = logging.getLogger("uvicorn.error")  # shows up in the Render log stream
_HEAVY = threading.Lock()


def rss_mb() -> float | None:
    """Resident memory of this process in MB (Linux); None where /proc is unavailable."""
    try:
        with open("/proc/self/status") as fh:
            for line in fh:
                if line.startswith("VmRSS:"):
                    return round(int(line.split()[1]) / 1024, 1)
    except OSError:
        pass
    return None


def trim_memory() -> None:
    gc.collect()
    arrow = sys.modules.get("pyarrow")
    if arrow is not None:  # Arrow keeps freed pages in its own pool until told to release them
        try:
            arrow.default_memory_pool().release_unused()
        except Exception:
            pass
    try:
        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except (OSError, AttributeError):
        pass  # not glibc (macOS / Windows): nothing to trim


@contextmanager
def heavy_job(label: str):
    with _HEAVY:
        start = rss_mb()
        log.info("[job:%s] start, rss=%s MB", label, start)
        try:
            yield
        finally:
            trim_memory()
            log.info("[job:%s] done,  rss=%s MB", label, rss_mb())

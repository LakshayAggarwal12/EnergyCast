"""CSV loading: format sniffing (delimiter, header, quote-wrapped lines) and parsing to Pandas."""
from __future__ import annotations

import io
import itertools
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Sequence

import pandas as pd

CANDIDATE_DELIMITERS = [",", ";", "\t", "|"]
SNIFF_BYTES = 64 * 1024


class CsvFormatError(ValueError):
    """The file cannot be read as a CSV table."""


@dataclass(frozen=True)
class CsvMeta:
    delimiter: str
    has_header: bool
    wrapped_in_quotes: bool  # every line is wrapped in one pair of double quotes: "a;b;c"
    columns: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CsvMeta":
        return cls(**data)


def _is_number(token: str) -> bool:
    try:
        float(token.strip())
        return True
    except ValueError:
        return False


def sniff_csv(path: Path) -> CsvMeta:
    with open(path, "rb") as fh:
        head = fh.read(SNIFF_BYTES)
    if not head:
        raise CsvFormatError("The file is empty.")
    if b"\x00" in head:
        raise CsvFormatError("The file looks binary, not text. Upload a CSV file.")
    try:
        text = head.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        if exc.start >= len(head) - 4:  # multi-byte character cut by the sniff window
            text = head[: exc.start].decode("utf-8-sig")
        else:
            raise CsvFormatError("The file is not valid UTF-8 text.") from exc

    lines = text.splitlines()
    first = lines[0].strip() if lines else ""
    if not first:
        raise CsvFormatError("The first line of the file is empty.")

    wrapped = len(first) >= 2 and first[0] == '"' and first[-1] == '"' and '"' not in first[1:-1]
    if wrapped:
        first = first[1:-1]

    counts = {d: first.count(d) for d in CANDIDATE_DELIMITERS}
    delimiter = max(counts, key=lambda d: counts[d])
    if counts[delimiter] == 0:
        delimiter = ","
    tokens = [t.strip().strip('"') for t in first.split(delimiter)]

    has_header = not all(_is_number(t) for t in tokens if t != "")
    if has_header:
        if any(t == "" for t in tokens):
            raise CsvFormatError("The header row contains empty column names.")
        if len(set(tokens)) != len(tokens):
            raise CsvFormatError("The header row contains duplicate column names.")
        columns = tokens
    else:
        columns = [f"col_{i}" for i in range(len(tokens))]
    return CsvMeta(delimiter=delimiter, has_header=has_header, wrapped_in_quotes=wrapped, columns=columns)


def read_csv_frame(
    path: Path,
    meta: CsvMeta | None = None,
    na_values: Sequence[str] = ("?",),
    nrows: int | None = None,
) -> pd.DataFrame:
    """Read the CSV as-is. Timestamp columns stay as text; numeric columns are inferred by Pandas."""
    meta = meta or sniff_csv(path)
    with open(path, "rb") as fh:
        if nrows is None:
            data = fh.read()
        else:
            data = b"".join(itertools.islice(fh, nrows + (1 if meta.has_header else 0)))
    if meta.wrapped_in_quotes:
        data = data.replace(b'"', b"")
    try:
        df = pd.read_csv(
            io.BytesIO(data),
            sep=meta.delimiter,
            header=0 if meta.has_header else None,
            names=None if meta.has_header else meta.columns,
            na_values=list(na_values),
            encoding="utf-8-sig",
            low_memory=False,
        )
    except (pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeDecodeError) as exc:
        raise CsvFormatError(f"The CSV could not be parsed: {exc}") from exc
    df.columns = [str(c).strip() for c in df.columns]
    return df


def count_data_rows(path: Path, meta: CsvMeta) -> int:
    lines = 0
    last_byte = b"\n"
    with open(path, "rb") as fh:
        while chunk := fh.read(1024 * 1024):
            lines += chunk.count(b"\n")
            last_byte = chunk[-1:]
    if last_byte != b"\n":
        lines += 1
    return max(lines - (1 if meta.has_header else 0), 0)

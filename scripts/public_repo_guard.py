#!/usr/bin/env python3
"""Fail CI when obviously unsafe files are tracked in this public repository.

This is intentionally conservative and path-focused. It is not a replacement for
GitHub secret scanning or company security controls.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import PurePosixPath


FORBIDDEN_EXACT = {
    ".env",
    ".env.local",
    ".env.production",
    ".streamlit/secrets.toml",
}

FORBIDDEN_PREFIXES = (
    "data/internal/",
    "data/private/",
    "confidential/",
    "internal-data/",
    "secrets/",
)

FORBIDDEN_BASENAMES = {
    "secrets.toml",
    "credentials.json",
    "service-account.json",
    "id_rsa",
    "id_ed25519",
}

SUSPICIOUS_SUFFIXES = (
    ".pem",
    ".p12",
    ".pfx",
    ".key",
)


def tracked_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files"],
        check=True,
        text=True,
        capture_output=True,
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def reason(path: str) -> str | None:
    normalized = path.replace("\\", "/")
    p = PurePosixPath(normalized)

    if normalized in FORBIDDEN_EXACT:
        return "forbidden secret/config file"

    if normalized.startswith(FORBIDDEN_PREFIXES):
        return "forbidden public-repo data path"

    if p.name.lower() in FORBIDDEN_BASENAMES:
        return "credential/secret-like filename"

    if normalized.lower().endswith(SUSPICIOUS_SUFFIXES):
        return "private key/certificate-like file"

    return None


def main() -> int:
    violations: list[tuple[str, str]] = []

    for path in tracked_files():
        why = reason(path)
        if why:
            violations.append((path, why))

    if not violations:
        print("Public repository guard: OK")
        return 0

    print("Public repository guard: BLOCKED\n")
    print("The following tracked paths are unsafe for this public repository:")
    for path, why in violations:
        print(f" - {path}: {why}")

    print(
        "\nMove sensitive/internal data outside the public repository or use an "
        "approved private/internal storage boundary."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())

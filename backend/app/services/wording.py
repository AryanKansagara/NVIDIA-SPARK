import re

_SUBSTITUTIONS: list[tuple[str, str]] = [
    (r"hard red flag|red flag|hard flag", "elevated review recommended"),
    (r"high special assessment risk", "elevated maintenance complexity signal"),
    (r"potential tax increases", "potential neighbourhood change"),
    (r"\bmajor issues\b", "further due diligence recommended"),
    (r"\$3,500", ""),
    (r"insurance loading", ""),
]

# Compiled once for performance
_COMPILED = [(re.compile(pattern, re.IGNORECASE), replacement) for pattern, replacement in _SUBSTITUTIONS]

# Banned phrases used by validate() — the LHS of each substitution
_BANNED = [pattern for pattern, _ in _SUBSTITUTIONS]
_BANNED_COMPILED = [re.compile(p, re.IGNORECASE) for p in _BANNED]


def apply(text: str) -> str:
    """Apply all wording substitutions. Idempotent."""
    for pattern, replacement in _COMPILED:
        text = pattern.sub(replacement, text)
    return text.strip()


def validate(text: str) -> list[str]:
    """Return list of banned phrases still present in text. Empty = clean."""
    found = []
    for pattern in _BANNED_COMPILED:
        match = pattern.search(text)
        if match:
            found.append(match.group(0))
    return found

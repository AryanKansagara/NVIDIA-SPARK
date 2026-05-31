import re


def slugify(address: str) -> str:
    """'401 Richmond St W' -> '401-richmond-st-w'"""
    return re.sub(r"[^a-z0-9]+", "-", address.lower()).strip("-")

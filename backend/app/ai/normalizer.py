

import re

MONTHS = r"(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)"
UNITS = r"(km|kms|kilometer|kilometers|hr|hrs|hour|hours|day|days)"


def normalize_description(desc: str) -> str:
    """
    Normalize invoice line description for embedding similarity.
    """
    if not desc:
        return ""

    text = desc.lower()
    text = re.sub(MONTHS, "<MONTH>", text)
    text = re.sub(UNITS, "<UNIT>", text)
    text = re.sub(r"\d+(\.\d+)?", "<NUM>", text)
    text = re.sub(r"[^a-z<> ]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    return text


def normalize_vendor(name: str) -> str:
    """
    Normalize vendor name for consistent history lookup.
    """
    if not name:
        return ""

    text = name.lower()
    text = text.replace("×", "x")
    # Remove common corporate and geographic suffixes with word boundaries
    # Expanded list to handle geographic descriptors often used in master data
    suffixes = r"\b(pvt|private|ltd|limited|inc|llp|corp|corporation|llc|plc|gmbh|co|ag|us|usa|india|intl|international|asia|europe|uk)\b"
    text = re.sub(suffixes, "", text)
    
    # Remove all non-alphanumeric (keep spaces)
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    # Collapse multiple spaces and strip
    text = re.sub(r"\s+", " ", text).strip()

    return text


def normalize_address(address: str) -> str:
    """
    Normalize vendor address for consistent history lookup.
    """
    if not address:
        return ""

    text = address.lower()
    
    # Standardize common abbreviations
    abbreviations = {
        r"\bst\b": "street",
        r"\brd\b": "road",
        r"\bln\b": "lane",
        r"\bave\b": "avenue",
        r"\bblvd\b": "boulevard",
        r"\bdr\b": "drive",
        r"\bct\b": "court",
        r"\bpl\b": "place",
        r"\bsq\b": "square",
        r"\bste\b": "suite",
        r"\bapt\b": "apartment",
        r"\bno\b": "number",
        r"\bp\.?o\.?\s*box\b": "pobox",
        r"\bhwy\b": "highway",
        r"\bpkwy\b": "parkway"
    }
    
    for pattern, replacement in abbreviations.items():
        text = re.sub(pattern, replacement, text)

    # Remove all non-alphanumeric
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    # Collapse multiple spaces and strip
    text = re.sub(r"\s+", " ", text).strip()

    return text



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
    text = re.sub(r"(pvt|private|ltd|limited|inc|llp|corp|corporation)", "", text)
    text = re.sub(r"[^a-z ]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    return text

import os
import requests
import hashlib
import logging
from functools import lru_cache
from typing import List

logger = logging.getLogger(__name__)

AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")
AZURE_OPENAI_API_VERSION = os.getenv(
    "AZURE_OPENAI_API_VERSION", "2024-12-01-preview"
)

# ✅ Match Azure embedding dimension
EMBEDDING_DIM = 1536


def _azure_configured() -> bool:
    return bool(
        AZURE_OPENAI_ENDPOINT and
        AZURE_OPENAI_API_KEY and
        AZURE_OPENAI_DEPLOYMENT
    )


@lru_cache(maxsize=3000)
def _simple_embedding(text_hash: str, dim: int = EMBEDDING_DIM) -> List[float]:
    """
    Deterministic fallback embedding based on hashed n-grams.
    """
    embedding = [0.0] * dim

    for i in range(len(text_hash)):
        for n in (1, 2, 3):
            if i + n <= len(text_hash):
                ngram = text_hash[i:i+n]
                idx = int(hashlib.md5(ngram.encode()).hexdigest(), 16) % dim
                embedding[idx] += 1.0

    # Normalize
    norm = sum(x * x for x in embedding) ** 0.5
    if norm > 0:
        embedding = [x / norm for x in embedding]

    return embedding


@lru_cache(maxsize=5000)
def embed_text(text: str) -> List[float]:
    """
    Generate embedding for text using Azure OpenAI or fallback method.
    """
    if not text or not text.strip():
        return [0.0] * EMBEDDING_DIM

    text = text.strip().lower()
    text_hash = hashlib.sha256(text.encode()).hexdigest()

    if _azure_configured():
        try:
            url = (
                f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/"
                f"{AZURE_OPENAI_DEPLOYMENT}/embeddings"
                f"?api-version={AZURE_OPENAI_API_VERSION}"
            )

            headers = {
                "Content-Type": "application/json",
                "api-key": AZURE_OPENAI_API_KEY
            }

            payload = {"input": text[:8000]}
            response = requests.post(url, headers=headers, json=payload, timeout=20)
            response.raise_for_status()

            embedding = response.json()["data"][0]["embedding"]

            if len(embedding) != EMBEDDING_DIM:
                logger.warning(
                    f"Unexpected embedding dimension: {len(embedding)}"
                )

            return embedding

        except Exception as e:
            logger.error(f"Azure OpenAI embedding failed: {e}")
            logger.warning("Falling back to local embedding")

    return _simple_embedding(text_hash)


def clear_cache():
    embed_text.cache_clear()
    _simple_embedding.cache_clear()
    logger.info("Embedding cache cleared")

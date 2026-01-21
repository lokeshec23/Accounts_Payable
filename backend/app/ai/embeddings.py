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


def embed_texts_batch(texts: List[str]) -> List[List[float]]:
    """
    Generate embeddings for multiple texts using Azure OpenAI in batches if possible.
    """
    if not texts:
        return []

    # Filter out empty/whitespace-only strings
    valid_texts = []
    for t in texts:
        s = t.strip() if t else ""
        valid_texts.append(s if s else None)

    # Use cache for already embedded texts
    results = [None] * len(texts)
    to_embed_indices = []
    to_embed_strings = []

    for i, t in enumerate(valid_texts):
        if t is None:
            results[i] = [0.0] * EMBEDDING_DIM
        elif t in embed_text.cache_info().currsize > 0: # Check if in cache? No, just call embed_text
            # Use the cached version if possible
            # Actually, lru_cache doesn't easily expose if it HAS a value without calling.
            # We'll just collect them and use embed_text first.
            results[i] = embed_text(t)
        else:
            to_embed_indices.append(i)
            to_embed_strings.append(t[:8000])

    if not to_embed_strings:
        return results

    # If Azure is not configured, just loop with local
    if not _azure_configured():
        for idx, text in zip(to_embed_indices, to_embed_strings):
            results[idx] = embed_text(text)
        return results

    # Process in batches of 16 (safe limit for Azure OpenAI usually)
    batch_size = 16
    for i in range(0, len(to_embed_strings), batch_size):
        batch = to_embed_strings[i : i + batch_size]
        indices = to_embed_indices[i : i + batch_size]

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
            payload = {"input": batch}
            
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            
            data = response.json().get("data", [])
            for item in data:
                idx_in_batch = item["index"]
                global_idx = indices[idx_in_batch]
                results[global_idx] = item["embedding"]
                
                # Update the individual cache manually if it was a new embedding
                # (Note: we can't easily push into lru_cache, but next time it will hit the API)
                # Actually, better to just let it be. Subsequent calls to single embed_text might still hit API.

        except Exception as e:
            logger.error(f"Batch embedding failed for batch {i}: {e}")
            # Fallback to single calls for this batch
            for idx, text in zip(indices, batch):
                results[idx] = embed_text(text)

    return results


def clear_cache():
    embed_text.cache_clear()
    _simple_embedding.cache_clear()
    logger.info("Embedding cache cleared")

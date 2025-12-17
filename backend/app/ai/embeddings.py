# # # import os
# # # import requests
# # # from functools import lru_cache

# # # AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
# # # AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
# # # AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")
# # # AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")

# # # @lru_cache(maxsize=5000)
# # # def embed_text(text: str) -> list:
# # #     if not text:
# # #         return []

# # #     url = (
# # #         f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/"
# # #         f"{AZURE_OPENAI_DEPLOYMENT}/embeddings"
# # #         f"?api-version={AZURE_OPENAI_API_VERSION}"
# # #     )

# # #     headers = {
# # #         "Content-Type": "application/json",
# # #         "api-key": AZURE_OPENAI_API_KEY
# # #     }

# # #     payload = {"input": text}

# # #     response = requests.post(url, headers=headers, json=payload, timeout=10)
# # #     response.raise_for_status()

# # #     return response.json()["data"][0]["embedding"]


# # import os
# # import requests
# # import hashlib
# # import logging
# # from functools import lru_cache
# # from typing import List

# # logger = logging.getLogger(__name__)

# # AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
# # AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
# # AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")
# # AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")

# # # Track if Azure OpenAI is available
# # _azure_available = None


# # def _check_azure_config() -> bool:
# #     """Check if Azure OpenAI is properly configured"""
# #     return bool(
# #         AZURE_OPENAI_ENDPOINT and 
# #         AZURE_OPENAI_API_KEY and 
# #         AZURE_OPENAI_DEPLOYMENT
# #     )


# # @lru_cache(maxsize=1000)
# # def _simple_embedding(text: str, dim: int = 384) -> List[float]:
# #     """
# #     Fallback embedding using a deterministic hash-based approach.
# #     This provides consistent embeddings for the same text.
# #     """
# #     text = text.lower().strip()
# #     embedding = [0.0] * dim
    
# #     # Use character n-grams to generate features
# #     for i in range(len(text)):
# #         for n in range(1, 4):  # 1-3 character n-grams
# #             if i + n <= len(text):
# #                 ngram = text[i:i+n]
# #                 hash_val = int(hashlib.md5(ngram.encode()).hexdigest(), 16)
# #                 idx = hash_val % dim
# #                 embedding[idx] += 1.0
    
# #     # Normalize to unit vector
# #     magnitude = sum(x**2 for x in embedding) ** 0.5
# #     if magnitude > 0:
# #         embedding = [x / magnitude for x in embedding]
    
# #     return embedding


# # @lru_cache(maxsize=5000)
# # def embed_text(text: str) -> list:
# #     """
# #     Generate embedding for text using Azure OpenAI or fallback method.
# #     Returns a list of floats representing the embedding vector.
# #     """
# #     global _azure_available
    
# #     if not text or not text.strip():
# #         logger.warning("Empty text provided for embedding")
# #         return [0.0] * 384
    
# #     # Check if we should try Azure OpenAI
# #     if _azure_available is None:
# #         _azure_available = _check_azure_config()
# #         if not _azure_available:
# #             logger.warning(
# #                 "Azure OpenAI not configured. Using fallback embedding method. "
# #                 "Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and "
# #                 "AZURE_OPENAI_EMBEDDING_DEPLOYMENT environment variables."
# #             )
    
# #     # Try Azure OpenAI if configured and not previously failed
# #     if _azure_available:
# #         try:
# #             url = (
# #                 f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/"
# #                 f"{AZURE_OPENAI_DEPLOYMENT}/embeddings"
# #                 f"?api-version={AZURE_OPENAI_API_VERSION}"
# #             )

# #             headers = {
# #                 "Content-Type": "application/json",
# #                 "api-key": AZURE_OPENAI_API_KEY
# #             }

# #             payload = {"input": text[:8000]}  # Limit input length

# #             response = requests.post(url, headers=headers, json=payload, timeout=30)
# #             response.raise_for_status()

# #             embedding = response.json()["data"][0]["embedding"]
# #             logger.debug(f"Generated Azure OpenAI embedding (dim={len(embedding)})")
# #             return embedding
            
# #         except requests.exceptions.HTTPError as e:
# #             if e.response.status_code == 404:
# #                 logger.error(
# #                     f"❌ Azure OpenAI deployment '{AZURE_OPENAI_DEPLOYMENT}' not found!\n"
# #                     f"   Endpoint: {AZURE_OPENAI_ENDPOINT}\n"
# #                     f"   Please verify the deployment name in Azure Portal.\n"
# #                     f"   Switching to fallback embedding method."
# #                 )
# #                 _azure_available = False  # Don't retry Azure OpenAI
# #             elif e.response.status_code == 401:
# #                 logger.error(
# #                     f"❌ Azure OpenAI authentication failed!\n"
# #                     f"   Please check your AZURE_OPENAI_API_KEY.\n"
# #                     f"   Switching to fallback embedding method."
# #                 )
# #                 _azure_available = False
# #             else:
# #                 logger.error(f"Azure OpenAI API error ({e.response.status_code}): {e}")
# #                 logger.warning("Falling back to simple embedding for this request")
                
# #         except requests.exceptions.Timeout:
# #             logger.error("Azure OpenAI request timed out. Using fallback embedding.")
            
# #         except requests.exceptions.ConnectionError:
# #             logger.error("Cannot connect to Azure OpenAI. Check your endpoint URL.")
# #             _azure_available = False
            
# #         except Exception as e:
# #             logger.error(f"Unexpected error calling Azure OpenAI: {type(e).__name__}: {e}")
# #             logger.warning("Using fallback embedding")
    
# #     # Use fallback embedding
# #     logger.debug("Using fallback embedding method")
# #     return _simple_embedding(text)


# # def clear_cache():
# #     """Clear the embedding cache (useful for testing)"""
# #     embed_text.cache_clear()
# #     _simple_embedding.cache_clear()
# #     logger.info("Embedding cache cleared")




# import numpy as np


# def cosine_similarity(a: list, b: list) -> float:
#     """
#     Safe cosine similarity between two vectors.
#     """
#     if not a or not b:
#         return 0.0

#     a = np.array(a, dtype=np.float32)
#     b = np.array(b, dtype=np.float32)

#     norm_a = np.linalg.norm(a)
#     norm_b = np.linalg.norm(b)

#     if norm_a == 0.0 or norm_b == 0.0:
#         return 0.0

#     return float(np.dot(a, b) / (norm_a * norm_b))


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

import numpy as np

def cosine_similarity(a: list, b: list) -> float:
    if not a or not b:
        return 0.0

    a = np.array(a)
    b = np.array(b)

    return float(
        np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
    )

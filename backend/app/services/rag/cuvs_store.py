"""GPU vector search backed by NVIDIA cuVS.

cuVS is a *library*, not a database — it provides the GPU ANN index only. We keep
ChromaDB as the on-disk store of record (vectors + text + source metadata) and
build a cuVS index *from* it in the GB10's unified memory. So:

    ChromaDB (persistence, text, metadata)  ->  cuVS index (GPU search)

This gives NVIDIA-accelerated retrieval with zero change to ingestion, and lets
RAGService fall straight back to ChromaDB's CPU search if the GPU path is
unavailable (degrade, don't disappear).

For tiny corpora we use cuVS brute-force (exact, no graph-build warnings); for
larger ones, CAGRA (Blackwell-native graph index). Vectors are L2-normalized so
Euclidean ranking matches cosine similarity.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Below this many vectors, exact brute-force is faster and avoids CAGRA's
# graph-degree minimums; above it, CAGRA's approximate graph index wins.
_CAGRA_MIN_ROWS = 256


class CuvsIndex:
    """In-memory GPU index built from the ChromaDB collection's vectors."""

    def __init__(self) -> None:
        self._index = None
        self._kind: str | None = None  # "brute_force" | "cagra"
        self._vecs = None  # normalized vectors on GPU (cupy), for exact rescoring
        self._docs: list[str] = []
        self._sources: list[str] = []
        self._n = 0
        self._dim: int | None = None

    def ready(self) -> bool:
        return self._index is not None and self._n > 0

    @property
    def kind(self) -> str | None:
        return self._kind

    def build_from_collection(self, collection) -> int:
        """Pull all vectors+docs from a Chroma collection and build a GPU index."""
        if collection.count() == 0:
            return 0
        data = collection.get(include=["embeddings", "documents", "metadatas"])
        embeddings = data.get("embeddings")  # numpy array — avoid truthiness on arrays
        if embeddings is None or len(embeddings) == 0:
            return 0
        documents = data.get("documents") or []
        metadatas = data.get("metadatas")
        if not metadatas:
            metadatas = [{}] * len(documents)
        return self.build(embeddings, documents, metadatas)

    def build(self, embeddings, documents, metadatas) -> int:
        import cupy as cp
        import numpy as np

        if embeddings is None or len(embeddings) == 0:
            return 0
        arr = np.ascontiguousarray(np.asarray(embeddings, dtype=np.float32))
        arr /= np.linalg.norm(arr, axis=1, keepdims=True) + 1e-9  # cosine via L2
        gpu = cp.asarray(arr)
        self._vecs = gpu

        if arr.shape[0] >= _CAGRA_MIN_ROWS:
            from cuvs.neighbors import cagra

            self._index = cagra.build(cagra.IndexParams(), gpu)
            self._kind = "cagra"
        else:
            from cuvs.neighbors import brute_force

            self._index = brute_force.build(gpu)
            self._kind = "brute_force"

        self._docs = list(documents)
        self._sources = [(m or {}).get("source", "land_laws") for m in metadatas]
        self._n = arr.shape[0]
        self._dim = arr.shape[1]
        logger.info("cuVS index built: %s rows=%d kind=%s", self._kind, self._n, self._kind)
        return self._n

    def search(self, embedding: list[float], k: int) -> list[tuple[str, str, float]]:
        """Return up to k (text, source, cosine_score) tuples, most similar first.

        cuVS generates GPU candidates (ANN); we then exact-rescore that small
        candidate set with a cupy dot product. This guarantees correct ordering
        (cuVS brute-force returns a phantom first slot on tiny corpora), yields a
        real cosine score for citations, and still does the heavy lifting on GPU.
        """
        if not self.ready():
            return []
        import cupy as cp
        import numpy as np

        q = np.ascontiguousarray(np.asarray([embedding], dtype=np.float32))
        q /= np.linalg.norm(q, axis=1, keepdims=True) + 1e-9
        gq = cp.asarray(q)

        # Over-fetch candidates from the cuVS index (drop the phantom slot).
        n_fetch = min(k + 1, self._n)
        if self._kind == "cagra":
            from cuvs.neighbors import cagra

            _, nn = cagra.search(cagra.SearchParams(), self._index, gq, n_fetch)
        else:
            from cuvs.neighbors import brute_force

            _, nn = brute_force.search(self._index, gq, n_fetch)

        cand: list[int] = []
        for idx in cp.asarray(nn).get()[0]:
            idx = int(idx)
            if 0 <= idx < self._n and idx not in cand:
                cand.append(idx)
        if not cand:
            return []

        # Exact cosine rescore of the candidate set (vectors are normalized).
        sims = cp.asarray(self._vecs[cand] @ gq[0]).get()
        ranked = sorted(zip(cand, sims), key=lambda t: -t[1])[:k]
        return [(self._docs[i], self._sources[i], float(sc)) for i, sc in ranked]

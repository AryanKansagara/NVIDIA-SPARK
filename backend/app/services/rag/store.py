"""
File-backed vector store using numpy cosine similarity.
Replaces chromadb to avoid Rust/Python 3.14 compatibility issues.
"""
import json
from pathlib import Path

import numpy as np


class VectorStore:
    def __init__(self, store_dir: Path) -> None:
        self._dir = store_dir
        self._dir.mkdir(parents=True, exist_ok=True)
        self._embeddings_path = store_dir / "embeddings.npy"
        self._metadata_path = store_dir / "metadata.json"
        self._load()

    def _load(self) -> None:
        if self._embeddings_path.exists() and self._metadata_path.exists():
            self._embeddings: np.ndarray = np.load(str(self._embeddings_path))
            with open(self._metadata_path, encoding="utf-8") as f:
                self._records: list[dict] = json.load(f)
        else:
            self._embeddings = np.empty((0, 0), dtype=np.float32)
            self._records = []

    def _save(self) -> None:
        np.save(str(self._embeddings_path), self._embeddings)
        with open(self._metadata_path, "w", encoding="utf-8") as f:
            json.dump(self._records, f)

    def count(self) -> int:
        return len(self._records)

    def upsert(
        self,
        ids: list[str],
        documents: list[str],
        embeddings: list[list[float]],
        metadatas: list[dict],
    ) -> None:
        id_to_index = {r["_id"]: i for i, r in enumerate(self._records)}
        new_embs = np.array(embeddings, dtype=np.float32)

        for emb, id_, doc, meta in zip(new_embs, ids, documents, metadatas):
            record = {**meta, "_id": id_, "document": doc}
            if id_ in id_to_index:
                idx = id_to_index[id_]
                self._records[idx] = record
                self._embeddings[idx] = emb
            else:
                self._records.append(record)
                self._embeddings = (
                    emb.reshape(1, -1)
                    if self._embeddings.shape[0] == 0
                    else np.vstack([self._embeddings, emb.reshape(1, -1)])
                )

        self._save()

    def query(self, query_embeddings: list[list[float]], n_results: int) -> dict:
        if not self._records:
            return {"documents": [[]]}

        q = np.array(query_embeddings[0], dtype=np.float32)
        norms = np.linalg.norm(self._embeddings, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1e-10, norms)
        scores = (self._embeddings / norms) @ (q / (np.linalg.norm(q) + 1e-10))

        top_k = min(n_results, len(self._records))
        top_indices = np.argsort(scores)[::-1][:top_k]
        return {"documents": [[self._records[i]["document"] for i in top_indices]]}

from functools import lru_cache
from sentence_transformers import SentenceTransformer
from pinecone import Pinecone, ServerlessSpec
from app.config import settings

@lru_cache()
def get_embedding_model():
    return SentenceTransformer('all-MiniLM-L6-v2')

@lru_cache()
def clients():
    if not settings.pinecone_api_key:
        raise ValueError("Pinecone API key must be set in environment variables.")
    return Pinecone(api_key=settings.pinecone_api_key)

def ensure_index():
    pc = clients()
    if not pc.has_index(settings.pinecone_index):
        pc.create_index(
            name=settings.pinecone_index,
            dimension=384,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1")
        )
    return pc.Index(settings.pinecone_index)

def embed(texts):
    model = get_embedding_model()
    embeddings = model.encode(texts, show_progress_bar=False)
    return embeddings.tolist()

def search_kb(query, top_k=5):
    index = ensure_index()
    vector = embed([query])[0]
    result = index.query(vector=vector, top_k=top_k, include_metadata=True)
    return [
        {
            "page": m.metadata.get("page"),
            "text": m.metadata.get("text", ""),
            "score": round(m.score, 3),
            "source": "Gale Encyclopedia (2002)"
        }
        for m in result.matches if m.score >= 0.30
    ]
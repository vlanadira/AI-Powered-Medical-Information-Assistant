from functools import lru_cache
from sentence_transformers import SentenceTransformer
from pinecone import Pinecone, ServerlessSpec
from app.config import settings

@lru_cache()
def get_embedding_model():
    return SentenceTransformer(settings.embed_model)

@lru_cache()
def clients():
    if not settings.pinecone_api_key:
        raise ValueError("Pinecone API key must be set in environment variables.")
    return Pinecone(api_key=settings.pinecone_api_key)

def ensure_index():
    pc = clients()
    existing_indexes = [idx["name"] for idx in pc.list_indexes()]
    if settings.pinecone_index not in existing_indexes:
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
    
    matches = result.get("matches", []) if isinstance(result, dict) else getattr(result, "matches", [])
    
    formatted_results = []
    for m in matches:
        metadata = m.get("metadata", {}) if isinstance(m, dict) else getattr(m, "metadata", {})
        score = m.get("score", 0.0) if isinstance(m, dict) else getattr(m, "score", 0.0)
        
        if score >= 0.30:
            formatted_results.append({
                "page": metadata.get("page"),
                "text": metadata.get("text", ""),
                "score": round(score, 3),
                "source": metadata.get("source", "Gale Encyclopedia (2002)")
            })
            
    return formatted_results
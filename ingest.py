import argparse
import hashlib
from pathlib import Path
import pymupdf as fitz
from tqdm import tqdm
from app.knowledge import ensure_index, embed

def chunks(text, size=1100, overlap=180):
    text = ' '.join(text.split())
    step = size - overlap
    return [
        text[i : i + size]
        for i in range(0, len(text), step)
        if len(text[i : i + size]) > 80
    ]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pdf', default='data/Medical_book.pdf')
    args = parser.parse_args()
    
    pdf = Path(args.pdf)
    if not pdf.exists():
        raise SystemExit(f'PDF not found: {pdf}')

    index = ensure_index()
    
    with fitz.open(pdf) as doc:
        batch = []
        for page_number, page in enumerate(
            tqdm(doc, desc='Ingesting PDF', unit='page'), start=1
        ):
            page_text = page.get_text()
            if not page_text.strip():
                continue

            for part, content in enumerate(chunks(page_text), start=1):
                key = hashlib.sha256(
                    f'{pdf.name}:{page_number}:{part}:{content}'.encode()
                ).hexdigest()
                
                batch.append({
                    'id': key,
                    'text': content,
                    'metadata': {
                        'page': page_number, 
                        'text': content, 
                        'file': pdf.name,
                        'source': 'Gale Encyclopedia (2002)'
                    }
                })

                # Upsert in batches of 32
                if len(batch) >= 32:
                    texts_to_embed = [item['text'] for item in batch]
                    vectors = embed(texts_to_embed)
                    
                    upsert_data = [
                        {
                            'id': item['id'],
                            'values': vector,
                            'metadata': item['metadata']
                        }
                        for item, vector in zip(batch, vectors)
                    ]
                    
                    index.upsert(vectors=upsert_data)
                    batch = []

        # Flush any remaining items in the last batch
        if batch:
            texts_to_embed = [item['text'] for item in batch]
            vectors = embed(texts_to_embed)
            
            upsert_data = [
                {
                    'id': item['id'],
                    'values': vector,
                    'metadata': item['metadata']
                }
                for item, vector in zip(batch, vectors)
            ]
            
            index.upsert(vectors=upsert_data)

    print('\nIngestion completed successfully!')

if __name__ == '__main__':
    main()
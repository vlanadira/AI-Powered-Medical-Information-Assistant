import base64
import secrets
from pathlib import Path
from uuid import uuid4
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from groq import Groq
from app.config import settings
from app.agent import graph

ROOT = Path(__file__).resolve().parent.parent
app = FastAPI(title='Medical Agent Educational API', version='1.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(','),
    allow_credentials=False,
    allow_methods=['GET', 'POST'],
    allow_headers=['Authorization', 'Content-Type', 'X-Conversation-ID']
)
app.mount('/static', StaticFiles(directory=ROOT/'static'), name='static')


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[dict[str, str]] = Field(default_factory=list, max_length=10)
    image_data: str | None = None


def auth(authorization: str | None):
    if settings.api_token and not secrets.compare_digest(authorization or '', f'Bearer {settings.api_token}'):
        raise HTTPException(status_code=401, detail='Invalid API token')


def inspect_image(data: str | None) -> str:
    if not data:
        return ''
    try:
        header, payload = data.split(',', 1)
        mime = header.split(';')[0].split(':')[1]
        raw = base64.b64decode(payload, validate=True)
        if mime not in ('image/jpeg', 'image/png', 'image/webp') or len(raw) > 5_000_000:
            raise ValueError('Only JPEG/PNG/WebP under 5MB supported')
    except (ValueError, IndexError) as exc:
        raise HTTPException(status_code=400, detail=f'Invalid image: {exc}')

    try:
        client = Groq(api_key=settings.groq_api_key)
        response = client.chat.completions.create(
            model=settings.groq_vision_model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Describe only objectively visible medical-relevant features. Do not diagnose, estimate severity, or assert absence of illness. If image unclear, say so."
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": data}
                        }
                    ]
                }
            ],
            max_tokens=300,
            temperature=0.1
        )
        return response.choices[0].message.content or ''
    except Exception as exc:
        print('Vision inspection error:', repr(exc), flush=True)
        return ''


@app.get('/', response_class=HTMLResponse)
def home():
    return (ROOT/'templates'/'index.html').read_text(encoding='utf-8')


@app.get('/api/health')
def health():
    return {
        'status': 'ok',
        'configured': bool(settings.groq_api_key and settings.pinecone_api_key),
        'tavily': bool(settings.tavily_api_key)
    }


@app.post('/api/transcribe')
def transcribe(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None)
):
    auth(authorization)

    if not settings.groq_api_key:
        raise HTTPException(503, 'Set GROQ_API_KEY in .env to enable transcription')

    content_type = (file.content_type or '').split(';', 1)[0].strip().lower()
    supported_types = {
        'audio/flac',
        'audio/mp4',
        'audio/mpeg',
        'audio/ogg',
        'audio/wav',
        'audio/webm',
        'audio/x-flac',
        'audio/x-wav',
    }
    if content_type not in supported_types:
        raise HTTPException(415, 'Unsupported audio format')

    audio = file.file.read(25 * 1024 * 1024 + 1)
    if len(audio) > 25 * 1024 * 1024:
        raise HTTPException(413, 'Audio must be 25 MB or smaller')
    if not audio:
        raise HTTPException(400, 'Audio recording is empty')

    try:
        result = Groq(api_key=settings.groq_api_key).audio.transcriptions.create(
            file=(file.filename or 'recording.webm', audio, file.content_type),
            model=settings.groq_transcription_model,
            response_format='json',
        )
        return {'text': result.text}
    except Exception as exc:
        print('Transcription error:', repr(exc), flush=True)
        raise HTTPException(502, 'Audio transcription failed. Check Groq credentials and server logs.')


@app.post('/api/chat')
def chat(
    payload: ChatRequest,
    authorization: str | None = Header(default=None),
    conversation_id: str | None = Header(default=None, alias='X-Conversation-ID')
):
    auth(authorization)

    if not settings.groq_api_key or not settings.pinecone_api_key:
        raise HTTPException(503, 'Set GROQ_API_KEY and PINECONE_API_KEY in .env')

    history = [x for x in payload.history if x.get('role') in ('user', 'assistant') and isinstance(x.get('content'), str)][:10]

    thread_id = conversation_id or str(uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    try:
        observation = inspect_image(payload.image_data)

        state = graph.invoke(
            {
                'question': payload.message,
                'history': history,
                'image_description': observation,
                'kb': [],
                'web': [],
                'answer': '',
                'route': ''
            },
            config=config
        )

        return {
            'answer': state['answer'],
            'sources': [{'type': 'pdf', 'page': x['page'], 'score': x['score']} for x in state['kb']] + [{'type': 'web', 'url': x['url'], 'title': x['title']} for x in state['web']],
            'tools': ([] if state['route'] == 'smalltalk' else ['pinecone']) + (['tavily'] if state['route'] == 'web' and settings.tavily_api_key else []) + (['vision'] if observation else []),
            'conversation_id': thread_id
        }

    except HTTPException:
        raise
    except Exception as exc:
        print('Chat error:', repr(exc), flush=True)
        raise HTTPException(502, 'AI service failed. Check server logs, credentials, Pinecone index, and connectivity.')
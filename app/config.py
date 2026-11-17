import os
import certifi
from dotenv import load_dotenv

# Automatic SSL fix for Conda/Python env
ssl_cert = os.environ.get('SSL_CERT_FILE')
if ssl_cert and not os.path.exists(ssl_cert):
	os.environ['SSL_CERT_FILE'] = certifi.where()
elif not ssl_cert:
	os.environ['SSL_CERT_FILE'] = certifi.where()

load_dotenv()
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
	pinecone_api_key: str = ''
	tavily_api_key: str = ''
	pinecone_index: str = 'medical-agent'
	gemini_api_key: str = ''
	gemini_chat_model: str = 'gemini-2.5-flash'
	gemini_embed_model: str = 'gemini-embedding-2'
	gemini_vision_model: str = 'gemini-2.5-flash'
	api_token: str = ''
	allowed_origins: str = 'http://localhost:8000,http://127.0.0.1:8000'
	model_config = SettingsConfigDict(env_file='.env', extra='ignore')
	
settings = Settings()
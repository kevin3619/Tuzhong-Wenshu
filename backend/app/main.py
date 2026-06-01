from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.config import settings
from app.routers import novels, auth, models, generate, chapters, characters, world_settings
from app.database import engine, Base

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create tables on startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created successfully")
    yield
    # Shutdown
    logger.info("Shutting down...")

app = FastAPI(
    title="途中文枢 API",
    description="AI小说写作助手后端 API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix=settings.API_PREFIX, tags=["auth"])
app.include_router(novels.router, prefix=settings.API_PREFIX, tags=["novels"])
app.include_router(chapters.router, prefix=settings.API_PREFIX, tags=["chapters"])
app.include_router(characters.router, prefix=settings.API_PREFIX, tags=["characters"])
app.include_router(world_settings.router, prefix=settings.API_PREFIX, tags=["world_settings"])
app.include_router(models.router, prefix=settings.API_PREFIX, tags=["models"])
app.include_router(generate.router, prefix=settings.API_PREFIX, tags=["generate"])

@app.get("/")
async def root():
    return {
        "message": "欢迎使用途中文枢 API",
        "docs": "/api/docs",
        "version": "0.1.0"
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG
    )

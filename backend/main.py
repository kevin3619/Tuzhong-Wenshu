from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
import logging
from logging.handlers import RotatingFileHandler
import os
from datetime import datetime

# Import routers
from app.routers import auth, novels, chapters, characters, world_settings, versions, search, users, export
from app.middleware import LoggingMiddleware, ErrorHandlingMiddleware
from app.database import Base, engine

# Configure logging
def setup_logging():
    log_dir = "logs"
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)
    
    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    
    # File handler with rotation
    file_handler = RotatingFileHandler(
        f"{log_dir}/app_{datetime.now().strftime('%Y%m%d')}.log",
        maxBytes=10485760,  # 10MB
        backupCount=10
    )
    file_handler.setLevel(logging.DEBUG)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    
    # Formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)
    
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Tuzhong Wenshu - AI Novel Writing Assistant",
    description="Backend API for AI-powered novel writing assistance",
    version="1.0.0"
)

# Create database tables
Base.metadata.create_all(bind=engine)
logger.info("Database tables created successfully")

# CORS middleware configuration
origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]

if os.getenv("ENVIRONMENT") == "production":
    origins.append(os.getenv("FRONTEND_URL", "https://example.com"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Trusted host middleware
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[
        "localhost",
        "127.0.0.1",
        "*.example.com"
    ]
)

# Custom middleware
app.add_middleware(LoggingMiddleware)
app.add_middleware(ErrorHandlingMiddleware)

# Include routers
app.include_router(auth.router, tags=["Authentication"])
app.include_router(novels.router, tags=["Novels"])
app.include_router(chapters.router, tags=["Chapters"])
app.include_router(characters.router, tags=["Characters"])
app.include_router(world_settings.router, tags=["World Settings"])
app.include_router(versions.router, tags=["Version Control"])
app.include_router(search.router, tags=["Search"])
app.include_router(users.router, tags=["Users"])
app.include_router(export.router, tags=["Export"])

# Health check endpoint
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    }

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "Tuzhong Wenshu - AI Novel Writing Assistant",
        "version": "1.0.0",
        "docs": "/docs"
    }

# Startup event
@app.on_event("startup")
async def startup_event():
    logger.info("Application startup")
    logger.info(f"Environment: {os.getenv('ENVIRONMENT', 'development')}")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Application shutdown")

if __name__ == "__main__":
    import uvicorn
    
    environment = os.getenv("ENVIRONMENT", "development")
    debug_mode = environment == "development"
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=debug_mode,
        log_level="info"
    )

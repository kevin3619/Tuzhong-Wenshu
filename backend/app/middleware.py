from fastapi import Request
from fastapi.responses import JSONResponse
import logging
from datetime import datetime
from typing import Callable

logger = logging.getLogger(__name__)

class LoggingMiddleware:
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, request: Request, call_next: Callable) -> JSONResponse:
        # Log request
        logger.info(f"{request.method} {request.url.path}")
        
        response = await call_next(request)
        
        # Log response
        logger.info(f"{request.method} {request.url.path} - {response.status_code}")
        
        return response

class ErrorHandlingMiddleware:
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, request: Request, call_next: Callable):
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            logger.error(f"Error: {str(e)}", exc_info=True)
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal Server Error"}
            )

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.generate import GenerateRequest, GenerateResponse
from app.schemas.chapter import ChapterCreate
from app.services.siliconflow import SiliconFlowService
from app.models.user import User
from app.routers.auth import get_current_user
from app.crud.chapter import ChapterCRUD
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/generate")
siliconflow_service = SiliconFlowService()

@router.post("/", response_model=GenerateResponse)
async def generate_text(
    request: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate text using SiliconFlow API"""
    try:
        result = await siliconflow_service.generate_text(
            prompt=request.prompt,
            context=request.context,
            model=request.options.model,
            temperature=request.options.temperature,
            max_tokens=request.options.max_tokens,
            top_p=request.options.top_p,
        )
        return GenerateResponse(**result)
    except Exception as e:
        logger.error(f"Generation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Generation failed"
        )

@router.post("/stream")
async def stream_generate(
    request: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Stream text generation from SiliconFlow API"""
    
    async def generate():
        try:
            async for chunk in siliconflow_service.stream_generate(
                prompt=request.prompt,
                context=request.context,
                model=request.options.model,
                temperature=request.options.temperature,
                max_tokens=request.options.max_tokens,
                top_p=request.options.top_p,
            ):
                yield chunk
        except Exception as e:
            logger.error(f"Stream generation error: {e}")
            yield f"Error: {str(e)}"
    
    return StreamingResponse(generate(), media_type="text/event-stream")

@router.post("/outline")
async def generate_outline(
    novel_title: str,
    novel_description: str,
    chapter_count: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate novel outline using AI"""
    prompt = f"""为下面的小说生成{chapter_count}章的详细大纲。
    
    小说标题: {novel_title}
    小说描述: {novel_description}
    
    请为每一章提供：
    1. 章节标题
    2. 章节大纲（简要描述该章节的主要内容）
    
    格式要求：
    第1章：标题
    大纲描述
    
    第2章：标题
    大纲描述
    """
    
    try:
        result = await siliconflow_service.generate_text(
            prompt=prompt,
            context="",
            model="Qwen/Qwen3-8B",
            temperature=0.7,
            max_tokens=2000,
            top_p=0.95,
        )
        return {"outline": result["text"]}
    except Exception as e:
        logger.error(f"Outline generation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Outline generation failed"
        )

@router.post("/suggestions")
async def generate_suggestions(
    context: str,
    novel_id: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate writing suggestions based on context"""
    prompt = f"""基于以下故事内容，生成3个合理的续写建议。每个建议应该是完整的段落（50-100字），继续故事的发展。
    
    当前故事内容：
    {context}
    
    请提供3个不同风格或方向的续写建议，每个建议占一行。"""
    
    try:
        result = await siliconflow_service.generate_text(
            prompt=prompt,
            context="",
            model="Qwen/Qwen3-8B",
            temperature=0.8,
            max_tokens=800,
            top_p=0.95,
        )
        
        # Split suggestions by newlines
        suggestions = [s.strip() for s in result["text"].split("\n") if s.strip()]
        return {"suggestions": suggestions[:3]}
    except Exception as e:
        logger.error(f"Suggestions generation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Suggestions generation failed"
        )

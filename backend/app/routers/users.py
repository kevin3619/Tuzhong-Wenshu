from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from app.database import get_db
from app.models.user import User
from app.crud.user import UserCRUD
from app.routers.auth import get_current_user
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users")

class UserStatsResponse(BaseModel):
    total_novels: int
    total_characters: int
    total_world_settings: int
    total_chapters: int
    total_words: int
    
class UserPreferencesUpdate(BaseModel):
    preferred_model: str = None
    default_temperature: float = None
    default_max_tokens: int = None

@router.get("/profile")
async def get_user_profile(
    current_user: User = Depends(get_current_user)
):
    """Get current user profile"""
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "is_active": current_user.is_active,
        "created_at": current_user.created_at,
    }

@router.get("/stats")
async def get_user_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get user statistics"""
    from app.models.novel import Novel, Chapter
    from app.models.character import Character
    from app.models.world_setting import WorldSetting
    
    novels = db.query(Novel).filter(Novel.user_id == current_user.id).all()
    total_novels = len(novels)
    total_chapters = sum(novel.chapter_count for novel in novels)
    total_words = sum(novel.word_count for novel in novels)
    
    characters = db.query(Character).filter(Character.user_id == current_user.id).all()
    world_settings = db.query(WorldSetting).filter(WorldSetting.user_id == current_user.id).all()
    
    return UserStatsResponse(
        total_novels=total_novels,
        total_characters=len(characters),
        total_world_settings=len(world_settings),
        total_chapters=total_chapters,
        total_words=total_words
    )

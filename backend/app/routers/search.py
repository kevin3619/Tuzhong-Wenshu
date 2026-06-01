from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.database import get_db
from app.models.user import User
from app.models.novel import Novel
from app.crud.novel import NovelCRUD
from app.routers.auth import get_current_user

router = APIRouter(prefix="/search")

class SearchRequest(BaseModel):
    query: str
    category: Optional[str] = None  # novels, chapters, characters, world_settings

class SearchResponse(BaseModel):
    id: str
    title: str
    type: str
    novel_id: Optional[str] = None
    preview: str

@router.post("/")
async def search(
    search_req: SearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[SearchResponse]:
    """Search across novels, chapters, characters, and world settings"""
    query = search_req.query.lower()
    results = []
    
    # Search novels
    if not search_req.category or search_req.category == "novels":
        novels = db.query(Novel).filter(
            Novel.user_id == current_user.id,
            Novel.title.ilike(f"%{query}%")
        ).all()
        
        for novel in novels:
            results.append(SearchResponse(
                id=novel.id,
                title=novel.title,
                type="novel",
                preview=novel.description or "No description"
            ))
    
    return results[:50]  # Limit to 50 results

@router.get("/novels/by-status/{status}")
async def get_novels_by_status(
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get novels by status (draft, writing, completed, archived)"""
    novels = db.query(Novel).filter(
        Novel.user_id == current_user.id,
        Novel.status == status
    ).all()
    return novels

@router.get("/novels/by-genre/{genre}")
async def get_novels_by_genre(
    genre: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get novels by genre"""
    novels = db.query(Novel).filter(
        Novel.user_id == current_user.id,
        Novel.genre == genre
    ).all()
    return novels

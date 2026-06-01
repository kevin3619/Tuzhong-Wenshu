from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from app.database import get_db
from app.schemas.chapter import ChapterCreate, ChapterUpdate, ChapterResponse
from app.models.user import User
from app.models.novel import Chapter
from app.crud.chapter import ChapterCRUD
from app.crud.novel import NovelCRUD
from app.routers.auth import get_current_user

router = APIRouter(prefix="/chapters")

class ChapterCreateRequest(BaseModel):
    chapter_number: int
    title: str
    outline: str = None
    content: str = ""

@router.post("/novels/{novel_id}", response_model=ChapterResponse)
async def create_chapter(
    novel_id: str,
    chapter_data: ChapterCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    novel = NovelCRUD.get_novel_by_id(db, novel_id)
    if not novel or novel.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Novel not found"
        )
    
    chapter = ChapterCRUD.create_chapter(
        db, novel_id, chapter_data.chapter_number, chapter_data.title
    )
    if chapter_data.outline:
        chapter = ChapterCRUD.update_chapter(db, chapter.id, outline=chapter_data.outline)
    if chapter_data.content:
        chapter = ChapterCRUD.update_chapter(db, chapter.id, content=chapter_data.content)
    
    return chapter

@router.get("/novels/{novel_id}", response_model=List[ChapterResponse])
async def list_chapters(
    novel_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    novel = NovelCRUD.get_novel_by_id(db, novel_id)
    if not novel or novel.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Novel not found"
        )
    
    return ChapterCRUD.get_novel_chapters(db, novel_id)

@router.get("/{chapter_id}", response_model=ChapterResponse)
async def get_chapter(
    chapter_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    chapter = ChapterCRUD.get_chapter_by_id(db, chapter_id)
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chapter not found"
        )
    
    novel = NovelCRUD.get_novel_by_id(db, chapter.novel_id)
    if not novel or novel.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chapter not found"
        )
    
    return chapter

@router.put("/{chapter_id}", response_model=ChapterResponse)
async def update_chapter_endpoint(
    chapter_id: str,
    chapter_update: ChapterUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    chapter = ChapterCRUD.get_chapter_by_id(db, chapter_id)
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chapter not found"
        )
    
    novel = NovelCRUD.get_novel_by_id(db, chapter.novel_id)
    if not novel or novel.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chapter not found"
        )
    
    update_data = chapter_update.model_dump(exclude_unset=True)
    if "content" in update_data and update_data["content"]:
        update_data["word_count"] = len(update_data["content"].split())
    
    return ChapterCRUD.update_chapter(db, chapter_id, **update_data)

@router.delete("/{chapter_id}")
async def delete_chapter(
    chapter_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    chapter = ChapterCRUD.get_chapter_by_id(db, chapter_id)
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chapter not found"
        )
    
    novel = NovelCRUD.get_novel_by_id(db, chapter.novel_id)
    if not novel or novel.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chapter not found"
        )
    
    ChapterCRUD.delete_chapter(db, chapter_id)
    return {"status": "success"}

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.user import User
from app.models.novel import Chapter
from app.crud.chapter import ChapterCRUD
from app.crud.novel import NovelCRUD
from app.routers.auth import get_current_user

router = APIRouter(prefix="/chapters")

class ChapterCreate:
    def __init__(self, chapter_number: int, title: str, outline: str = None, content: str = ""):
        self.chapter_number = chapter_number
        self.title = title
        self.outline = outline
        self.content = content

class ChapterResponse:
    pass

@router.post("/novels/{novel_id}")
async def create_chapter(
    novel_id: str,
    chapter_number: int,
    title: str,
    outline: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    novel = NovelCRUD.get_novel_by_id(db, novel_id)
    if not novel or novel.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Novel not found"
        )
    
    chapter = ChapterCRUD.create_chapter(db, novel_id, chapter_number, title)
    if outline:
        chapter = ChapterCRUD.update_chapter(db, chapter.id, outline=outline)
    
    return chapter

@router.get("/novels/{novel_id}")
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

@router.get("/{chapter_id}")
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

@router.put("/{chapter_id}")
async def update_chapter(
    chapter_id: str,
    title: str = None,
    content: str = None,
    outline: str = None,
    status: str = None,
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
    
    update_data = {
        k: v for k, v in {
            "title": title,
            "content": content,
            "outline": outline,
            "status": status,
            "word_count": len(content.split()) if content else None
        }.items() if v is not None
    }
    
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

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas.novel import NovelCreate, NovelUpdate, NovelResponse
from app.crud.novel import NovelCRUD
from app.models.user import User
from app.routers.auth import get_current_user

router = APIRouter(prefix="/novels")

@router.post("/", response_model=NovelResponse)
async def create_novel(
    novel_create: NovelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return NovelCRUD.create_novel(db, current_user.id, novel_create)

@router.get("/", response_model=List[NovelResponse])
async def list_novels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return NovelCRUD.get_user_novels(db, current_user.id)

@router.get("/{novel_id}", response_model=NovelResponse)
async def get_novel(
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
    
    return novel

@router.put("/{novel_id}", response_model=NovelResponse)
async def update_novel(
    novel_id: str,
    novel_update: NovelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    novel = NovelCRUD.get_novel_by_id(db, novel_id)
    
    if not novel or novel.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Novel not found"
        )
    
    return NovelCRUD.update_novel(db, novel_id, novel_update)

@router.delete("/{novel_id}")
async def delete_novel(
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
    
    NovelCRUD.delete_novel(db, novel_id)
    return {"status": "success"}

@router.post("/{novel_id}/save")
async def save_novel(
    novel_id: str,
    content: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    novel = NovelCRUD.get_novel_by_id(db, novel_id)
    
    if not novel or novel.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Novel not found"
        )
    
    # Update content and word count
    word_count = len(content.split())
    return NovelCRUD.update_novel(
        db,
        novel_id,
        NovelUpdate(content=content, word_count=word_count)
    )

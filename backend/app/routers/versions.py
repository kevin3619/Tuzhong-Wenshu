from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from app.database import get_db
from app.models.user import User
from app.models.novel_version import NovelVersion
from app.crud.novel_version import NovelVersionCRUD
from app.crud.novel import NovelCRUD
from app.routers.auth import get_current_user

router = APIRouter(prefix="/versions")

class NovelVersionCreate(BaseModel):
    content: str
    description: str = None

class NovelVersionResponse(BaseModel):
    id: str
    novel_id: str
    version_number: int
    content: str
    description: str = None
    created_at: str
    
    class Config:
        from_attributes = True

@router.post("/novels/{novel_id}", response_model=NovelVersionResponse)
async def create_version(
    novel_id: str,
    version_data: NovelVersionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    novel = NovelCRUD.get_novel_by_id(db, novel_id)
    if not novel or novel.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Novel not found"
        )
    
    version = NovelVersionCRUD.create_version(
        db,
        novel_id,
        version_data.content,
        version_data.description
    )
    return version

@router.get("/novels/{novel_id}", response_model=List[NovelVersionResponse])
async def list_versions(
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
    
    return NovelVersionCRUD.get_novel_versions(db, novel_id)

@router.get("/{version_id}", response_model=NovelVersionResponse)
async def get_version(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    version = NovelVersionCRUD.get_version_by_id(db, version_id)
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found"
        )
    
    novel = NovelCRUD.get_novel_by_id(db, version.novel_id)
    if not novel or novel.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found"
        )
    
    return version

@router.post("/{version_id}/restore")
async def restore_version(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    version = NovelVersionCRUD.get_version_by_id(db, version_id)
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found"
        )
    
    novel = NovelCRUD.get_novel_by_id(db, version.novel_id)
    if not novel or novel.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found"
        )
    
    # Restore the version content
    NovelCRUD.update_novel(
        db,
        novel.id,
        type('NovelUpdate', (), {'content': version.content, 'word_count': len(version.content.split())})()
    )
    
    return {"status": "success", "message": f"Restored to version {version.version_number}"}

@router.delete("/{version_id}")
async def delete_version(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    version = NovelVersionCRUD.get_version_by_id(db, version_id)
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found"
        )
    
    novel = NovelCRUD.get_novel_by_id(db, version.novel_id)
    if not novel or novel.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found"
        )
    
    NovelVersionCRUD.delete_version(db, version_id)
    return {"status": "success"}

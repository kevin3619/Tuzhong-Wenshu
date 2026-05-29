from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.crud.character import CharacterCRUD
from app.crud.novel import NovelCRUD
from app.routers.auth import get_current_user

router = APIRouter(prefix="/characters")

@router.post("/")
async def create_character(
    name: str,
    description: str = None,
    personality: str = None,
    background: str = None,
    role: str = None,
    novel_id: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if novel_id:
        novel = NovelCRUD.get_novel_by_id(db, novel_id)
        if not novel or novel.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Novel not found"
            )
    
    character = CharacterCRUD.create_character(
        db,
        current_user.id,
        name,
        description=description,
        personality=personality,
        background=background,
        role=role,
        novel_id=novel_id
    )
    return character

@router.get("/")
async def list_characters(
    novel_id: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return CharacterCRUD.get_user_characters(db, current_user.id, novel_id)

@router.get("/{character_id}")
async def get_character(
    character_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    character = CharacterCRUD.get_character_by_id(db, character_id)
    if not character or character.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    return character

@router.put("/{character_id}")
async def update_character(
    character_id: str,
    name: str = None,
    description: str = None,
    personality: str = None,
    background: str = None,
    role: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    character = CharacterCRUD.get_character_by_id(db, character_id)
    if not character or character.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    
    update_data = {
        k: v for k, v in {
            "name": name,
            "description": description,
            "personality": personality,
            "background": background,
            "role": role
        }.items() if v is not None
    }
    
    return CharacterCRUD.update_character(db, character_id, **update_data)

@router.delete("/{character_id}")
async def delete_character(
    character_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    character = CharacterCRUD.get_character_by_id(db, character_id)
    if not character or character.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    
    CharacterCRUD.delete_character(db, character_id)
    return {"status": "success"}

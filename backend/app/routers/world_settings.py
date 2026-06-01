from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from app.database import get_db
from app.schemas.world_setting import WorldSettingCreate, WorldSettingUpdate, WorldSettingResponse
from app.models.user import User
from app.crud.world_setting import WorldSettingCRUD
from app.crud.novel import NovelCRUD
from app.routers.auth import get_current_user

router = APIRouter(prefix="/world-settings")

@router.post("/", response_model=WorldSettingResponse)
async def create_world_setting(
    setting_data: WorldSettingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if setting_data.novel_id:
        novel = NovelCRUD.get_novel_by_id(db, setting_data.novel_id)
        if not novel or novel.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Novel not found"
            )
    
    setting = WorldSettingCRUD.create_world_setting(
        db,
        current_user.id,
        setting_data.name,
        description=setting_data.description,
        rules=setting_data.rules,
        history=setting_data.history,
        geography=setting_data.geography,
        novel_id=setting_data.novel_id
    )
    return setting

@router.get("/", response_model=List[WorldSettingResponse])
async def list_world_settings(
    novel_id: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return WorldSettingCRUD.get_user_world_settings(db, current_user.id, novel_id)

@router.get("/{setting_id}", response_model=WorldSettingResponse)
async def get_world_setting(
    setting_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    setting = WorldSettingCRUD.get_world_setting_by_id(db, setting_id)
    if not setting or setting.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="World setting not found"
        )
    return setting

@router.put("/{setting_id}", response_model=WorldSettingResponse)
async def update_world_setting(
    setting_id: str,
    setting_update: WorldSettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    setting = WorldSettingCRUD.get_world_setting_by_id(db, setting_id)
    if not setting or setting.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="World setting not found"
        )
    
    update_data = setting_update.model_dump(exclude_unset=True)
    return WorldSettingCRUD.update_world_setting(db, setting_id, **update_data)

@router.delete("/{setting_id}")
async def delete_world_setting(
    setting_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    setting = WorldSettingCRUD.get_world_setting_by_id(db, setting_id)
    if not setting or setting.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="World setting not found"
        )
    
    WorldSettingCRUD.delete_world_setting(db, setting_id)
    return {"status": "success"}

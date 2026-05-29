from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.crud.world_setting import WorldSettingCRUD
from app.crud.novel import NovelCRUD
from app.routers.auth import get_current_user

router = APIRouter(prefix="/world-settings")

@router.post("/")
async def create_world_setting(
    name: str,
    description: str = None,
    rules: str = None,
    history: str = None,
    geography: str = None,
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
    
    setting = WorldSettingCRUD.create_world_setting(
        db,
        current_user.id,
        name,
        description=description,
        rules=rules,
        history=history,
        geography=geography,
        novel_id=novel_id
    )
    return setting

@router.get("/")
async def list_world_settings(
    novel_id: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return WorldSettingCRUD.get_user_world_settings(db, current_user.id, novel_id)

@router.get("/{setting_id}")
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

@router.put("/{setting_id}")
async def update_world_setting(
    setting_id: str,
    name: str = None,
    description: str = None,
    rules: str = None,
    history: str = None,
    geography: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    setting = WorldSettingCRUD.get_world_setting_by_id(db, setting_id)
    if not setting or setting.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="World setting not found"
        )
    
    update_data = {
        k: v for k, v in {
            "name": name,
            "description": description,
            "rules": rules,
            "history": history,
            "geography": geography
        }.items() if v is not None
    }
    
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

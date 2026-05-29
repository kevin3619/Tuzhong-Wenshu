from sqlalchemy.orm import Session
from app.models.world_setting import WorldSetting
from typing import List

class WorldSettingCRUD:
    @staticmethod
    def create_world_setting(db: Session, user_id: str, name: str, **kwargs) -> WorldSetting:
        db_setting = WorldSetting(
            user_id=user_id,
            name=name,
            **kwargs
        )
        db.add(db_setting)
        db.commit()
        db.refresh(db_setting)
        return db_setting
    
    @staticmethod
    def get_world_setting_by_id(db: Session, setting_id: str) -> WorldSetting | None:
        return db.query(WorldSetting).filter(WorldSetting.id == setting_id).first()
    
    @staticmethod
    def get_user_world_settings(db: Session, user_id: str, novel_id: str | None = None) -> List[WorldSetting]:
        query = db.query(WorldSetting).filter(WorldSetting.user_id == user_id)
        if novel_id:
            query = query.filter(WorldSetting.novel_id == novel_id)
        return query.all()
    
    @staticmethod
    def update_world_setting(db: Session, setting_id: str, **kwargs) -> WorldSetting | None:
        db_setting = db.query(WorldSetting).filter(WorldSetting.id == setting_id).first()
        if not db_setting:
            return None
        
        for key, value in kwargs.items():
            if value is not None:
                setattr(db_setting, key, value)
        
        db.add(db_setting)
        db.commit()
        db.refresh(db_setting)
        return db_setting
    
    @staticmethod
    def delete_world_setting(db: Session, setting_id: str) -> bool:
        db_setting = db.query(WorldSetting).filter(WorldSetting.id == setting_id).first()
        if not db_setting:
            return False
        
        db.delete(db_setting)
        db.commit()
        return True

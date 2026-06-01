from sqlalchemy.orm import Session
from app.models.novel import Novel
from app.models.novel_version import NovelVersion
from typing import List
import uuid

class NovelVersionCRUD:
    @staticmethod
    def create_version(
        db: Session,
        novel_id: str,
        content: str,
        description: str = None
    ) -> NovelVersion:
        # Get the current max version number
        max_version = db.query(NovelVersion).filter(
            NovelVersion.novel_id == novel_id
        ).order_by(NovelVersion.version_number.desc()).first()
        
        version_number = (max_version.version_number + 1) if max_version else 1
        
        db_version = NovelVersion(
            id=str(uuid.uuid4()),
            novel_id=novel_id,
            version_number=version_number,
            content=content,
            description=description,
        )
        db.add(db_version)
        db.commit()
        db.refresh(db_version)
        return db_version
    
    @staticmethod
    def get_version_by_id(db: Session, version_id: str) -> NovelVersion | None:
        return db.query(NovelVersion).filter(NovelVersion.id == version_id).first()
    
    @staticmethod
    def get_novel_versions(db: Session, novel_id: str) -> List[NovelVersion]:
        return db.query(NovelVersion).filter(
            NovelVersion.novel_id == novel_id
        ).order_by(NovelVersion.version_number.desc()).all()
    
    @staticmethod
    def delete_version(db: Session, version_id: str) -> bool:
        db_version = db.query(NovelVersion).filter(NovelVersion.id == version_id).first()
        if not db_version:
            return False
        
        db.delete(db_version)
        db.commit()
        return True

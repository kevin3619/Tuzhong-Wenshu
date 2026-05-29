from sqlalchemy.orm import Session
from app.models.novel import Chapter
from typing import List

class ChapterCRUD:
    @staticmethod
    def create_chapter(db: Session, novel_id: str, chapter_number: int, title: str) -> Chapter:
        db_chapter = Chapter(
            novel_id=novel_id,
            chapter_number=chapter_number,
            title=title,
        )
        db.add(db_chapter)
        db.commit()
        db.refresh(db_chapter)
        return db_chapter
    
    @staticmethod
    def get_chapter_by_id(db: Session, chapter_id: str) -> Chapter | None:
        return db.query(Chapter).filter(Chapter.id == chapter_id).first()
    
    @staticmethod
    def get_novel_chapters(db: Session, novel_id: str) -> List[Chapter]:
        return db.query(Chapter).filter(Chapter.novel_id == novel_id).order_by(Chapter.chapter_number).all()
    
    @staticmethod
    def update_chapter(db: Session, chapter_id: str, **kwargs) -> Chapter | None:
        db_chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
        if not db_chapter:
            return None
        
        for key, value in kwargs.items():
            if value is not None:
                setattr(db_chapter, key, value)
        
        db.add(db_chapter)
        db.commit()
        db.refresh(db_chapter)
        return db_chapter
    
    @staticmethod
    def delete_chapter(db: Session, chapter_id: str) -> bool:
        db_chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
        if not db_chapter:
            return False
        
        db.delete(db_chapter)
        db.commit()
        return True

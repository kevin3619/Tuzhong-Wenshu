from sqlalchemy.orm import Session
from app.models.character import Character
from typing import List

class CharacterCRUD:
    @staticmethod
    def create_character(db: Session, user_id: str, name: str, **kwargs) -> Character:
        db_character = Character(
            user_id=user_id,
            name=name,
            **kwargs
        )
        db.add(db_character)
        db.commit()
        db.refresh(db_character)
        return db_character
    
    @staticmethod
    def get_character_by_id(db: Session, character_id: str) -> Character | None:
        return db.query(Character).filter(Character.id == character_id).first()
    
    @staticmethod
    def get_user_characters(db: Session, user_id: str, novel_id: str | None = None) -> List[Character]:
        query = db.query(Character).filter(Character.user_id == user_id)
        if novel_id:
            query = query.filter(Character.novel_id == novel_id)
        return query.all()
    
    @staticmethod
    def update_character(db: Session, character_id: str, **kwargs) -> Character | None:
        db_character = db.query(Character).filter(Character.id == character_id).first()
        if not db_character:
            return None
        
        for key, value in kwargs.items():
            if value is not None:
                setattr(db_character, key, value)
        
        db.add(db_character)
        db.commit()
        db.refresh(db_character)
        return db_character
    
    @staticmethod
    def delete_character(db: Session, character_id: str) -> bool:
        db_character = db.query(Character).filter(Character.id == character_id).first()
        if not db_character:
            return False
        
        db.delete(db_character)
        db.commit()
        return True

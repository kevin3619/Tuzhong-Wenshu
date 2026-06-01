from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CharacterCreate(BaseModel):
    name: str
    description: Optional[str] = None
    personality: Optional[str] = None
    background: Optional[str] = None
    role: Optional[str] = None
    novel_id: Optional[str] = None

class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    personality: Optional[str] = None
    background: Optional[str] = None
    role: Optional[str] = None

class CharacterResponse(BaseModel):
    id: str
    user_id: str
    novel_id: Optional[str]
    name: str
    description: Optional[str]
    personality: Optional[str]
    background: Optional[str]
    role: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

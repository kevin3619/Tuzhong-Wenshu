from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class WorldSettingCreate(BaseModel):
    name: str
    description: Optional[str] = None
    rules: Optional[str] = None
    history: Optional[str] = None
    geography: Optional[str] = None
    novel_id: Optional[str] = None

class WorldSettingUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    rules: Optional[str] = None
    history: Optional[str] = None
    geography: Optional[str] = None

class WorldSettingResponse(BaseModel):
    id: str
    user_id: str
    novel_id: Optional[str]
    name: str
    description: Optional[str]
    rules: Optional[str]
    history: Optional[str]
    geography: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

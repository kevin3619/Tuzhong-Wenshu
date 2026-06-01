from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ChapterCreate(BaseModel):
    chapter_number: int
    title: str
    outline: Optional[str] = None
    content: str = ""

class ChapterUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    outline: Optional[str] = None
    status: Optional[str] = None

class ChapterResponse(BaseModel):
    id: str
    novel_id: str
    chapter_number: int
    title: str
    outline: Optional[str]
    content: str
    word_count: int
    status: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

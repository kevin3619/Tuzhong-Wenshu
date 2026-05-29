from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base
import uuid

class NovelVersion(Base):
    __tablename__ = "novel_versions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    novel_id = Column(String, ForeignKey("novels.id"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    description = Column(String(255))  # 版本描述
    created_at = Column(DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f"<NovelVersion {self.version_number}>"

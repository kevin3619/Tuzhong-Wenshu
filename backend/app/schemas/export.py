from pydantic import BaseModel
from typing import Optional

class ExportRequest(BaseModel):
    format: str  # txt, pdf, epub, docx
    include_metadata: bool = True
    include_toc: bool = True

class ExportResponse(BaseModel):
    url: str
    filename: str
    format: str
    size: int

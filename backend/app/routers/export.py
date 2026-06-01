from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from io import BytesIO
from fastapi.responses import StreamingResponse, FileResponse
import logging
from datetime import datetime
from app.database import get_db
from app.models.user import User
from app.crud.novel import NovelCRUD
from app.routers.auth import get_current_user
from app.schemas.export import ExportRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/export")

def generate_txt_content(novel, include_metadata: bool = True) -> str:
    """Generate TXT format content"""
    lines = []
    
    if include_metadata:
        lines.append(f"标题: {novel.title}")
        lines.append(f"描述: {novel.description or 'N/A'}")
        lines.append(f"类型: {novel.genre or 'N/A'}")
        lines.append(f"字数: {novel.word_count}")
        lines.append(f"章节: {novel.chapter_count}")
        lines.append(f"导出时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append("=" * 80)
        lines.append("")
    
    lines.append(novel.content)
    
    return "\n".join(lines)

def generate_html_content(novel, include_metadata: bool = True) -> str:
    """Generate HTML format content"""
    html_parts = [
        "<!DOCTYPE html>",
        "<html>",
        "<head>",
        f"<title>{novel.title}</title>",
        "<meta charset='utf-8'>",
        "<style>",
        "  body { font-family: Arial, sans-serif; margin: 20px; }",
        "  h1 { color: #333; }",
        "  .metadata { background: #f0f0f0; padding: 10px; margin-bottom: 20px; }",
        "  .content { line-height: 1.6; }",
        "</style>",
        "</head>",
        "<body>",
    ]
    
    if include_metadata:
        html_parts.extend([
            "<div class='metadata'>",
            f"<p><strong>标题:</strong> {novel.title}</p>",
            f"<p><strong>描述:</strong> {novel.description or 'N/A'}</p>",
            f"<p><strong>类型:</strong> {novel.genre or 'N/A'}</p>",
            f"<p><strong>字数:</strong> {novel.word_count}</p>",
            f"<p><strong>章节:</strong> {novel.chapter_count}</p>",
            "</div>",
        ])
    
    # Convert newlines to <br> tags
    content = novel.content.replace("\n", "<br>")
    html_parts.extend([
        "<div class='content'>",
        content,
        "</div>",
        "</body>",
        "</html>"
    ])
    
    return "\n".join(html_parts)

@router.post("/novels/{novel_id}/txt")
async def export_to_txt(
    novel_id: str,
    include_metadata: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Export novel to TXT format"""
    novel = NovelCRUD.get_novel_by_id(db, novel_id)
    
    if not novel or novel.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Novel not found"
        )
    
    content = generate_txt_content(novel, include_metadata)
    
    filename = f"{novel.title}.txt"
    return StreamingResponse(
        iter([content]),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.post("/novels/{novel_id}/html")
async def export_to_html(
    novel_id: str,
    include_metadata: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Export novel to HTML format"""
    novel = NovelCRUD.get_novel_by_id(db, novel_id)
    
    if not novel or novel.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Novel not found"
        )
    
    content = generate_html_content(novel, include_metadata)
    
    filename = f"{novel.title}.html"
    return StreamingResponse(
        iter([content]),
        media_type="text/html",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.post("/novels/{novel_id}/markdown")
async def export_to_markdown(
    novel_id: str,
    include_metadata: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Export novel to Markdown format"""
    novel = NovelCRUD.get_novel_by_id(db, novel_id)
    
    if not novel or novel.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Novel not found"
        )
    
    lines = []
    
    if include_metadata:
        lines.extend([
            f"# {novel.title}",
            f"",
            f"## 元数据",
            f"- **描述**: {novel.description or 'N/A'}",
            f"- **类型**: {novel.genre or 'N/A'}",
            f"- **字数**: {novel.word_count}",
            f"- **章节**: {novel.chapter_count}",
            f"- **导出时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"",
            f"## 正文",
            f""
        ])
    
    lines.append(novel.content)
    content = "\n".join(lines)
    
    filename = f"{novel.title}.md"
    return StreamingResponse(
        iter([content]),
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

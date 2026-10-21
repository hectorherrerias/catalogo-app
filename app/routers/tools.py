from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.database import get_db_connection
from app.models import ToolCreate, ToolUpdate, ToolResponse

router = APIRouter(prefix="/api/tools", tags=["Herramientas de Taller"])

@router.get("", response_model=List[ToolResponse])
def get_tools(
    category: Optional[str] = Query(None, description="Filtrar por categoría"),
    search: Optional[str] = Query(None, description="Búsqueda por nombre o notas")
):
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM tools WHERE 1=1"
    params = []

    if category:
        query += " AND category = ?"
        params.append(category)

    if search:
        query += " AND (name LIKE ? OR notes LIKE ? OR supplier LIKE ?)"
        like_term = f"%{search}%"
        params.extend([like_term, like_term, like_term])

    query += " ORDER BY id DESC"
    cursor.execute(query, params)
    tools = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return tools

@router.post("", response_model=ToolResponse, status_code=201)
def create_tool(tool_in: ToolCreate):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO tools (name, category, supplier, price, status, notes, buy_url, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        tool_in.name,
        tool_in.category,
        tool_in.supplier,
        round(tool_in.price, 2),
        tool_in.status,
        tool_in.notes,
        tool_in.buy_url,
        tool_in.image_url
    ))
    tool_id = cursor.lastrowid
    conn.commit()

    cursor.execute("SELECT * FROM tools WHERE id = ?", (tool_id,))
    result = dict(cursor.fetchone())
    conn.close()
    return result

@router.put("/{tool_id}", response_model=ToolResponse)
def update_tool(tool_id: int, tool_in: ToolUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM tools WHERE id = ?", (tool_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Herramienta no encontrada")

    cursor.execute("""
        UPDATE tools
        SET name = ?, category = ?, supplier = ?, price = ?, status = ?, notes = ?, buy_url = ?, image_url = ?
        WHERE id = ?
    """, (
        tool_in.name,
        tool_in.category,
        tool_in.supplier,
        round(tool_in.price, 2),
        tool_in.status,
        tool_in.notes,
        tool_in.buy_url,
        tool_in.image_url,
        tool_id
    ))
    conn.commit()

    cursor.execute("SELECT * FROM tools WHERE id = ?", (tool_id,))
    result = dict(cursor.fetchone())
    conn.close()
    return result

@router.delete("/{tool_id}", status_code=204)
def delete_tool(tool_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM tools WHERE id = ?", (tool_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Herramienta no encontrada")

    cursor.execute("DELETE FROM tools WHERE id = ?", (tool_id,))
    conn.commit()
    conn.close()
    return None

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.database import get_db_connection
from app.models import PartCreate, PartUpdate, PartResponse

router = APIRouter(prefix="/api/parts", tags=["Piezas y Componentes"])

@router.get("", response_model=List[PartResponse])
def get_parts(
    part_type: Optional[str] = Query(None, description="Filtrar por tipo de pieza (Dial, Caja, Agujas, etc.)"),
    status: Optional[str] = Query(None, description="Filtrar por estado: 'Disponible', 'Asignado', 'Agotado'"),
    search: Optional[str] = Query(None, description="Búsqueda por nombre, compatibilidad o notas")
):
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT p.*, w.name as assigned_watch_name FROM parts p LEFT JOIN watches w ON w.id = p.assigned_watch_id WHERE 1=1"
    params = []

    if part_type:
        query += " AND p.part_type = ?"
        params.append(part_type)

    if status:
        query += " AND p.status = ?"
        params.append(status)

    if search:
        query += " AND (p.name LIKE ? OR p.compatibility LIKE ? OR p.supplier LIKE ? OR p.finish_notes LIKE ?)"
        like_term = f"%{search}%"
        params.extend([like_term, like_term, like_term, like_term])

    query += " ORDER BY p.id DESC"
    cursor.execute(query, params)
    parts = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return parts

@router.get("/{part_id}", response_model=PartResponse)
def get_part(part_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM parts WHERE id = ?", (part_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Pieza no encontrada")
    return dict(row)

@router.post("", response_model=PartResponse, status_code=201)
def create_part(part_in: PartCreate):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO parts (part_type, name, compatibility, supplier, price, finish_notes, status, assigned_watch_id, buy_url, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        part_in.part_type,
        part_in.name,
        part_in.compatibility,
        part_in.supplier,
        round(part_in.price, 2),
        part_in.finish_notes,
        part_in.status,
        part_in.assigned_watch_id,
        part_in.buy_url,
        part_in.image_url
    ))
    part_id = cursor.lastrowid
    conn.commit()

    cursor.execute("SELECT * FROM parts WHERE id = ?", (part_id,))
    result = dict(cursor.fetchone())
    conn.close()
    return result

@router.put("/{part_id}", response_model=PartResponse)
def update_part(part_id: int, part_in: PartUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM parts WHERE id = ?", (part_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Pieza no encontrada")

    cursor.execute("""
        UPDATE parts
        SET part_type = ?, name = ?, compatibility = ?, supplier = ?, price = ?, finish_notes = ?, status = ?, assigned_watch_id = ?, buy_url = ?, image_url = ?
        WHERE id = ?
    """, (
        part_in.part_type,
        part_in.name,
        part_in.compatibility,
        part_in.supplier,
        round(part_in.price, 2),
        part_in.finish_notes,
        part_in.status,
        part_in.assigned_watch_id,
        part_in.buy_url,
        part_in.image_url,
        part_id
    ))
    conn.commit()

    cursor.execute("SELECT * FROM parts WHERE id = ?", (part_id,))
    result = dict(cursor.fetchone())
    conn.close()
    return result

@router.delete("/{part_id}", status_code=204)
def delete_part(part_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM parts WHERE id = ?", (part_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Pieza no encontrada")

    cursor.execute("DELETE FROM parts WHERE id = ?", (part_id,))
    conn.commit()
    conn.close()
    return None

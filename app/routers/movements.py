from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.database import get_db_connection
from app.models import MovementCreate, MovementUpdate, MovementResponse, MovementStockUpdate

router = APIRouter(prefix="/api/movements", tags=["Movimientos"])

@router.get("", response_model=List[MovementResponse])
def get_movements(
    search: Optional[str] = Query(None, description="Búsqueda por modelo o proveedor")
):
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM movements WHERE 1=1"
    params = []

    if search:
        query += " AND (model LIKE ? OR supplier LIKE ?)"
        like_term = f"%{search}%"
        params.extend([like_term, like_term])

    query += " ORDER BY id DESC"
    cursor.execute(query, params)
    movements = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return movements

@router.get("/{movement_id}", response_model=MovementResponse)
def get_movement(movement_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM movements WHERE id = ?", (movement_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    return dict(row)

@router.post("", response_model=MovementResponse, status_code=201)
def create_movement(movement_in: MovementCreate):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO movements (model, supplier, unit_price, stock, bph, power_reserve, notes, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        movement_in.model,
        movement_in.supplier,
        round(movement_in.unit_price, 2),
        movement_in.stock,
        movement_in.bph,
        movement_in.power_reserve,
        movement_in.notes,
        movement_in.image_url
    ))
    movement_id = cursor.lastrowid
    conn.commit()

    cursor.execute("SELECT * FROM movements WHERE id = ?", (movement_id,))
    result = dict(cursor.fetchone())
    conn.close()
    return result

@router.put("/{movement_id}", response_model=MovementResponse)
def update_movement(movement_id: int, movement_in: MovementUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM movements WHERE id = ?", (movement_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    cursor.execute("""
        UPDATE movements
        SET model = ?, supplier = ?, unit_price = ?, stock = ?, bph = ?, power_reserve = ?, notes = ?, image_url = ?
        WHERE id = ?
    """, (
        movement_in.model,
        movement_in.supplier,
        round(movement_in.unit_price, 2),
        movement_in.stock,
        movement_in.bph,
        movement_in.power_reserve,
        movement_in.notes,
        movement_in.image_url,
        movement_id
    ))
    conn.commit()

    cursor.execute("SELECT * FROM movements WHERE id = ?", (movement_id,))
    result = dict(cursor.fetchone())
    conn.close()
    return result

@router.patch("/{movement_id}/stock", response_model=MovementResponse)
def adjust_movement_stock(movement_id: int, update: MovementStockUpdate):
    """Permite incrementar o decrementar el stock de calibres con 1 solo click (+1 / -1)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT stock FROM movements WHERE id = ?", (movement_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    current_stock = row["stock"]
    new_stock = max(0, current_stock + update.delta)

    cursor.execute("UPDATE movements SET stock = ? WHERE id = ?", (new_stock, movement_id))
    conn.commit()

    cursor.execute("SELECT * FROM movements WHERE id = ?", (movement_id,))
    result = dict(cursor.fetchone())
    conn.close()
    return result

@router.delete("/{movement_id}", status_code=204)
def delete_movement(movement_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM movements WHERE id = ?", (movement_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    cursor.execute("DELETE FROM movements WHERE id = ?", (movement_id,))
    conn.commit()
    conn.close()
    return None

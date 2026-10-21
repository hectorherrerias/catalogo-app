from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.database import get_db_connection
from app.models import WatchCreate, WatchUpdate, WatchResponse, WatchComponentCreate, WatchComponentStatusUpdate, WatchOwnershipUpdate

router = APIRouter(prefix="/api/watches", tags=["Relojes"])

def fetch_watch_with_components(cursor, watch_id: int) -> Optional[dict]:
    """Helper para obtener un reloj con todos sus componentes y nombre de catálogo."""
    cursor.execute("""
        SELECT w.*, c.name as catalog_name
        FROM watches w
        LEFT JOIN catalogs c ON c.id = w.catalog_id
        WHERE w.id = ?
    """, (watch_id,))
    watch_row = cursor.fetchone()
    if not watch_row:
        return None
    
    watch_dict = dict(watch_row)

    cursor.execute("SELECT * FROM watch_components WHERE watch_id = ? ORDER BY id ASC", (watch_id,))
    comp_rows = cursor.fetchall()
    watch_dict["components"] = [dict(c) for c in comp_rows]
    return watch_dict

@router.get("", response_model=List[WatchResponse])
def get_watches(
    ownership: Optional[str] = Query(None, description="Filtrar por 'owned' (Tengo), 'building' (Taller/En piezas), 'planned' (Quiero)"),
    status: Optional[str] = Query(None, description="Filtrar por estado: 'Montado', 'En piezas', 'En proyecto'"),
    catalog_id: Optional[int] = Query(None, description="Filtrar por catálogo específico"),
    search: Optional[str] = Query(None, description="Búsqueda por nombre, estilo o movimiento")
):
    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
        SELECT w.*, c.name as catalog_name
        FROM watches w
        LEFT JOIN catalogs c ON c.id = w.catalog_id
        WHERE 1=1
    """
    params = []

    if ownership:
        query += " AND w.ownership_status = ?"
        params.append(ownership)

    if status:
        query += " AND w.status = ?"
        params.append(status)

    if catalog_id:
        query += " AND w.catalog_id = ?"
        params.append(catalog_id)

    if search:
        query += " AND (w.name LIKE ? OR w.style LIKE ? OR w.movement_name LIKE ?)"
        like_term = f"%{search}%"
        params.extend([like_term, like_term, like_term])

    query += " ORDER BY w.id DESC"
    cursor.execute(query, params)
    watches = [dict(r) for r in cursor.fetchall()]

    # Cargar todos los componentes en una sola consulta en lugar de una por reloj
    by_watch = {w["id"]: w for w in watches}
    for w in watches:
        w["components"] = []
    if by_watch:
        placeholders = ",".join("?" * len(by_watch))
        cursor.execute(
            f"SELECT * FROM watch_components WHERE watch_id IN ({placeholders}) ORDER BY id ASC",
            list(by_watch.keys()),
        )
        for c in cursor.fetchall():
            by_watch[c["watch_id"]]["components"].append(dict(c))

    conn.close()
    return watches

@router.get("/{watch_id}", response_model=WatchResponse)
def get_watch(watch_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    watch = fetch_watch_with_components(cursor, watch_id)
    conn.close()

    if not watch:
        raise HTTPException(status_code=404, detail="Reloj no encontrado")
    return watch

@router.post("", response_model=WatchResponse, status_code=201)
def create_watch(watch_in: WatchCreate):
    conn = get_db_connection()
    cursor = conn.cursor()

    # Cálculo dinámico del coste total a partir de los componentes sumados
    total_cost = sum(c.price for c in watch_in.components) if watch_in.components else 0.0
    total_cost = round(total_cost, 2)

    cursor.execute("""
        INSERT INTO watches (catalog_id, name, style, movement_name, status, ownership_status, total_cost, estimated_value, image_url, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        watch_in.catalog_id,
        watch_in.name,
        watch_in.style,
        watch_in.movement_name,
        watch_in.status,
        watch_in.ownership_status,
        total_cost,
        watch_in.estimated_value,
        watch_in.image_url,
        watch_in.notes
    ))
    watch_id = cursor.lastrowid

    # Guardar cada componente asociado
    if watch_in.components:
        for c in watch_in.components:
            cursor.execute("""
                INSERT INTO watch_components (watch_id, component_type, name, price, supplier, part_id, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (watch_id, c.component_type, c.name, round(c.price, 2), c.supplier, c.part_id, c.status or "Recibido"))

    conn.commit()
    result = fetch_watch_with_components(cursor, watch_id)
    conn.close()
    return result

@router.put("/{watch_id}", response_model=WatchResponse)
def update_watch(watch_id: int, watch_in: WatchUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM watches WHERE id = ?", (watch_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Reloj no encontrado")

    # Actualizar componentes si se enviaron
    if watch_in.components is not None:
        cursor.execute("DELETE FROM watch_components WHERE watch_id = ?", (watch_id,))
        total_cost = 0.0
        for c in watch_in.components:
            c_price = round(c.price, 2)
            total_cost += c_price
            cursor.execute("""
                INSERT INTO watch_components (watch_id, component_type, name, price, supplier, part_id, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (watch_id, c.component_type, c.name, c_price, c.supplier, c.part_id, c.status or "Recibido"))
        total_cost = round(total_cost, 2)
    else:
        cursor.execute("SELECT COALESCE(SUM(price), 0.0) as total FROM watch_components WHERE watch_id = ?", (watch_id,))
        total_cost = round(cursor.fetchone()["total"], 2)

    cursor.execute("""
        UPDATE watches
        SET catalog_id = ?, name = ?, style = ?, movement_name = ?, status = ?, ownership_status = ?, total_cost = ?, estimated_value = ?, image_url = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (
        watch_in.catalog_id,
        watch_in.name,
        watch_in.style,
        watch_in.movement_name,
        watch_in.status,
        watch_in.ownership_status,
        total_cost,
        watch_in.estimated_value,
        watch_in.image_url,
        watch_in.notes,
        watch_id
    ))

    conn.commit()
    result = fetch_watch_with_components(cursor, watch_id)
    conn.close()
    return result

@router.delete("/{watch_id}", status_code=204)
def delete_watch(watch_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM watches WHERE id = ?", (watch_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Reloj no encontrado")

    cursor.execute("DELETE FROM watches WHERE id = ?", (watch_id,))
    conn.commit()
    conn.close()
    return None

@router.patch("/{watch_id}/toggle-ownership", response_model=WatchResponse)
def toggle_watch_ownership(watch_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT ownership_status FROM watches WHERE id = ?", (watch_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Reloj no encontrado")

    current_status = row["ownership_status"]
    new_status = "planned" if current_status == "owned" else "owned"

    cursor.execute("UPDATE watches SET ownership_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_status, watch_id))
    conn.commit()
    result = fetch_watch_with_components(cursor, watch_id)
    conn.close()
    return result

@router.post("/{watch_id}/components", response_model=WatchResponse)
def add_watch_component(watch_id: int, comp_in: WatchComponentCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM watches WHERE id = ?", (watch_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Reloj no encontrado")

    cursor.execute("""
        INSERT INTO watch_components (watch_id, component_type, name, price, supplier, part_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (watch_id, comp_in.component_type, comp_in.name, round(comp_in.price, 2), comp_in.supplier, comp_in.part_id, comp_in.status or "Recibido"))

    # Recalcular coste total del reloj
    _recalc_total(cursor, watch_id)
    conn.commit()
    result = fetch_watch_with_components(cursor, watch_id)
    conn.close()
    return result

@router.delete("/components/{comp_id}", response_model=WatchResponse)
def delete_watch_component(comp_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT watch_id FROM watch_components WHERE id = ?", (comp_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Componente no encontrado")
    watch_id = row["watch_id"]

    cursor.execute("DELETE FROM watch_components WHERE id = ?", (comp_id,))
    _recalc_total(cursor, watch_id)
    conn.commit()
    result = fetch_watch_with_components(cursor, watch_id)
    conn.close()
    return result

VALID_OWNERSHIP = {"owned", "building", "planned"}
VALID_COMPONENT_STATUS = {"Recibido", "Pedido", "Pendiente de compra"}

def _recalc_total(cursor, watch_id: int):
    cursor.execute("SELECT COALESCE(SUM(price), 0.0) as total FROM watch_components WHERE watch_id = ?", (watch_id,))
    total_cost = round(cursor.fetchone()["total"], 2)
    cursor.execute("UPDATE watches SET total_cost = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (total_cost, watch_id))

@router.patch("/{watch_id}/ownership", response_model=WatchResponse)
def set_watch_ownership(watch_id: int, payload: WatchOwnershipUpdate):
    if payload.ownership_status not in VALID_OWNERSHIP:
        raise HTTPException(status_code=422, detail="Estado de posesión no válido")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM watches WHERE id = ?", (watch_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Reloj no encontrado")

    # Al pasar a posesión, el reloj queda montado
    if payload.ownership_status == "owned":
        cursor.execute("UPDATE watches SET ownership_status = 'owned', status = 'Montado', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (watch_id,))
    else:
        cursor.execute("UPDATE watches SET ownership_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (payload.ownership_status, watch_id))
    conn.commit()
    result = fetch_watch_with_components(cursor, watch_id)
    conn.close()
    return result

@router.post("/{watch_id}/duplicate", response_model=WatchResponse, status_code=201)
def duplicate_watch(watch_id: int):
    """Clona un reloj con todo su despiece (útil para builds parecidos)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    original = fetch_watch_with_components(cursor, watch_id)
    if not original:
        conn.close()
        raise HTTPException(status_code=404, detail="Reloj no encontrado")

    cursor.execute("""
        INSERT INTO watches (catalog_id, name, style, movement_name, status, ownership_status, total_cost, estimated_value, image_url, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        original["catalog_id"], f"{original['name']} (copia)", original["style"], original["movement_name"],
        original["status"], original["ownership_status"], original["total_cost"], original["estimated_value"],
        original["image_url"], original["notes"]
    ))
    new_id = cursor.lastrowid
    for c in original["components"]:
        cursor.execute("""
            INSERT INTO watch_components (watch_id, component_type, name, price, supplier, part_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (new_id, c["component_type"], c["name"], c["price"], c["supplier"], c["part_id"], c["status"]))
    conn.commit()
    result = fetch_watch_with_components(cursor, new_id)
    conn.close()
    return result

@router.patch("/components/{comp_id}/status", response_model=WatchResponse)
def update_component_status(comp_id: int, payload: WatchComponentStatusUpdate):
    if payload.status not in VALID_COMPONENT_STATUS:
        raise HTTPException(status_code=422, detail="Estado de pieza no válido")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT watch_id FROM watch_components WHERE id = ?", (comp_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Componente no encontrado")
    cursor.execute("UPDATE watch_components SET status = ? WHERE id = ?", (payload.status, comp_id))
    cursor.execute("UPDATE watches SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (row["watch_id"],))
    conn.commit()
    result = fetch_watch_with_components(cursor, row["watch_id"])
    conn.close()
    return result

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.database import get_db_connection
from app.models import WishlistCreate, WishlistUpdate, WishlistResponse, WishlistConvertToInventory

router = APIRouter(prefix="/api/wishlist", tags=["Wishlist"])

@router.get("", response_model=List[WishlistResponse])
def get_wishlist(
    priority: Optional[str] = Query(None, description="Filtrar por prioridad: 'Alta', 'Media', 'Baja'"),
    status: Optional[str] = Query(None, description="Filtrar por estado: 'Pendiente', 'Comprado', 'Descartado'"),
    search: Optional[str] = Query(None, description="Búsqueda por nombre de ítem o notas")
):
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM wishlist WHERE 1=1"
    params = []

    if priority:
        query += " AND priority = ?"
        params.append(priority)

    if status:
        query += " AND status = ?"
        params.append(status)

    if search:
        query += " AND (item_name LIKE ? OR notes LIKE ?)"
        like_term = f"%{search}%"
        params.extend([like_term, like_term])

    # Ordenar por prioridad (Alta primero) y luego id desc
    query += " ORDER BY CASE priority WHEN 'Alta' THEN 1 WHEN 'Media' THEN 2 WHEN 'Baja' THEN 3 ELSE 4 END, id DESC"
    cursor.execute(query, params)
    items = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return items

@router.get("/{item_id}", response_model=WishlistResponse)
def get_wishlist_item(item_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM wishlist WHERE id = ?", (item_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Elemento de wishlist no encontrado")
    return dict(row)

@router.post("", response_model=WishlistResponse, status_code=201)
def create_wishlist_item(item_in: WishlistCreate):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO wishlist (item_name, category, buy_url, target_price, priority, status, notes, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        item_in.item_name,
        item_in.category,
        item_in.buy_url,
        round(item_in.target_price, 2),
        item_in.priority,
        item_in.status,
        item_in.notes,
        item_in.image_url
    ))
    item_id = cursor.lastrowid
    conn.commit()

    cursor.execute("SELECT * FROM wishlist WHERE id = ?", (item_id,))
    result = dict(cursor.fetchone())
    conn.close()
    return result

@router.put("/{item_id}", response_model=WishlistResponse)
def update_wishlist_item(item_id: int, item_in: WishlistUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM wishlist WHERE id = ?", (item_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Elemento no encontrado")

    cursor.execute("""
        UPDATE wishlist
        SET item_name = ?, category = ?, buy_url = ?, target_price = ?, priority = ?, status = ?, notes = ?, image_url = ?
        WHERE id = ?
    """, (
        item_in.item_name,
        item_in.category,
        item_in.buy_url,
        round(item_in.target_price, 2),
        item_in.priority,
        item_in.status,
        item_in.notes,
        item_in.image_url,
        item_id
    ))
    conn.commit()

    cursor.execute("SELECT * FROM wishlist WHERE id = ?", (item_id,))
    result = dict(cursor.fetchone())
    conn.close()
    return result

@router.post("/{item_id}/convert")
def convert_wishlist_to_inventory(item_id: int, payload: WishlistConvertToInventory):
    """Convierte un deseo en una pieza o movimiento real en el inventario al comprarlo."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM wishlist WHERE id = ?", (item_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Elemento de wishlist no encontrado")

    wishlist_item = dict(row)
    price = payload.actual_price if payload.actual_price is not None else wishlist_item["target_price"]
    supplier = payload.supplier or "Comprado de Wishlist"
    notes = payload.notes or wishlist_item.get("notes") or ""

    new_id = None
    if payload.inventory_type == "movement":
        cursor.execute("""
            INSERT INTO movements (model, supplier, unit_price, stock, notes, image_url)
            VALUES (?, ?, ?, 1, ?, ?)
        """, (wishlist_item["item_name"], supplier, round(price, 2), notes, wishlist_item.get("image_url")))
        new_id = cursor.lastrowid
    elif payload.inventory_type == "tool":
        cursor.execute("""
            INSERT INTO tools (name, category, supplier, price, status, notes, buy_url, image_url)
            VALUES (?, 'Otros', ?, ?, 'Disponible', ?, ?, ?)
        """, (wishlist_item["item_name"], supplier, round(price, 2), notes, wishlist_item.get("buy_url"), wishlist_item.get("image_url")))
        new_id = cursor.lastrowid
    else:
        # Pieza
        part_type = "Otro"
        # Deducir tipo común si está en el nombre
        lower_name = wishlist_item["item_name"].lower()
        if "dial" in lower_name or "esfera" in lower_name:
            part_type = "Dial"
        elif "aguja" in lower_name or "hands" in lower_name:
            part_type = "Agujas"
        elif "caja" in lower_name or "case" in lower_name:
            part_type = "Caja"
        elif "brazalete" in lower_name or "correa" in lower_name or "strap" in lower_name:
            part_type = "Brazalete"
        elif "bisel" in lower_name or "bezel" in lower_name:
            part_type = "Bisel"
        elif "cristal" in lower_name or "zafiro" in lower_name:
            part_type = "Cristal"

        cursor.execute("""
            INSERT INTO parts (part_type, name, compatibility, supplier, price, finish_notes, status, buy_url, image_url)
            VALUES (?, ?, ?, ?, ?, ?, 'Disponible', ?, ?)
        """, (
            part_type,
            wishlist_item["item_name"],
            "Estándar Mod",
            supplier,
            round(price, 2),
            notes,
            wishlist_item.get("buy_url"),
            wishlist_item.get("image_url")
        ))
        new_id = cursor.lastrowid

    # Marcar el item de wishlist como 'Comprado'
    cursor.execute("UPDATE wishlist SET status = 'Comprado' WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

    return {
        "message": f"Elemento convertido con éxito a {payload.inventory_type}",
        "new_inventory_id": new_id,
        "wishlist_id": item_id
    }

@router.delete("/{item_id}", status_code=204)
def delete_wishlist_item(item_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM wishlist WHERE id = ?", (item_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Elemento no encontrado")

    cursor.execute("DELETE FROM wishlist WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return None

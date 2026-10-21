from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.database import get_db_connection
from app.models import CatalogCreate, CatalogUpdate, CatalogResponse

router = APIRouter(prefix="/api/catalogs", tags=["Catálogos Independientes"])

@router.get("", response_model=List[CatalogResponse])
def get_catalogs():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            c.*, 
            COUNT(w.id) as watches_count,
            COALESCE(SUM(CASE WHEN w.ownership_status = 'owned' THEN 1 ELSE 0 END), 0) as owned_count,
            COALESCE(SUM(CASE WHEN w.ownership_status = 'planned' THEN 1 ELSE 0 END), 0) as planned_count,
            COALESCE(SUM(CASE WHEN w.ownership_status = 'owned' THEN w.total_cost ELSE 0 END), 0.0) as total_cost,
            COALESCE(SUM(CASE WHEN w.ownership_status = 'owned' THEN w.estimated_value ELSE 0 END), 0.0) as total_value
        FROM catalogs c
        LEFT JOIN watches w ON w.catalog_id = c.id
        GROUP BY c.id
        ORDER BY c.id ASC
    """)
    rows = cursor.fetchall()
    catalogs = [dict(r) for r in rows]
    conn.close()
    return catalogs

@router.get("/{catalog_id}", response_model=CatalogResponse)
def get_catalog(catalog_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            c.*, 
            COUNT(w.id) as watches_count,
            COALESCE(SUM(CASE WHEN w.ownership_status = 'owned' THEN 1 ELSE 0 END), 0) as owned_count,
            COALESCE(SUM(CASE WHEN w.ownership_status = 'planned' THEN 1 ELSE 0 END), 0) as planned_count,
            COALESCE(SUM(CASE WHEN w.ownership_status = 'owned' THEN w.total_cost ELSE 0 END), 0.0) as total_cost,
            COALESCE(SUM(CASE WHEN w.ownership_status = 'owned' THEN w.estimated_value ELSE 0 END), 0.0) as total_value
        FROM catalogs c
        LEFT JOIN watches w ON w.catalog_id = c.id
        WHERE c.id = ?
        GROUP BY c.id
    """, (catalog_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Catálogo no encontrado")
    return dict(row)

@router.post("", response_model=CatalogResponse, status_code=201)
def create_catalog(cat_in: CatalogCreate):
    conn = get_db_connection()
    cursor = conn.cursor()

    slug = cat_in.slug or cat_in.name.lower().replace(" ", "-")

    cursor.execute("""
        INSERT INTO catalogs (name, slug, description, icon, color)
        VALUES (?, ?, ?, ?, ?)
    """, (cat_in.name, slug, cat_in.description, cat_in.icon or "⌚", cat_in.color or "#c9a36a"))
    cat_id = cursor.lastrowid
    conn.commit()

    cursor.execute("""
        SELECT c.*, 0 as watches_count
        FROM catalogs c
        WHERE c.id = ?
    """, (cat_id,))
    result = dict(cursor.fetchone())
    conn.close()
    return result

@router.put("/{catalog_id}", response_model=CatalogResponse)
def update_catalog(catalog_id: int, cat_in: CatalogUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM catalogs WHERE id = ?", (catalog_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Catálogo no encontrado")

    slug = cat_in.slug or cat_in.name.lower().replace(" ", "-")

    cursor.execute("""
        UPDATE catalogs
        SET name = ?, slug = ?, description = ?, icon = ?, color = ?
        WHERE id = ?
    """, (cat_in.name, slug, cat_in.description, cat_in.icon or "⌚", cat_in.color or "#c9a36a", catalog_id))
    conn.commit()

    cursor.execute("""
        SELECT c.*, COUNT(w.id) as watches_count
        FROM catalogs c
        LEFT JOIN watches w ON w.catalog_id = c.id
        WHERE c.id = ?
        GROUP BY c.id
    """, (catalog_id,))
    result = dict(cursor.fetchone())
    conn.close()
    return result

@router.delete("/{catalog_id}", status_code=204)
def delete_catalog(catalog_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM catalogs WHERE id = ?", (catalog_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Catálogo no encontrado")

    # Desenlazar los relojes asociados
    cursor.execute("UPDATE watches SET catalog_id = NULL WHERE catalog_id = ?", (catalog_id,))
    cursor.execute("DELETE FROM catalogs WHERE id = ?", (catalog_id,))
    conn.commit()
    conn.close()
    return None

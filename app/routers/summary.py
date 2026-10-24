import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional
from fastapi import APIRouter, Body, HTTPException, Query
from app.database import DB_PATH, get_db_connection, seed_initial_data
from app.models import DashboardSummary

router = APIRouter(prefix="/api/summary", tags=["Dashboard y Resumen"])


def safety_backup(reason: str) -> str:
    """Copia consistente de la base antes de reemplazar o borrar datos (guarda las 20 últimas)."""
    backup_dir = Path(DB_PATH).parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    target = backup_dir / f"antes-{reason}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
    src = sqlite3.connect(DB_PATH)
    dst = sqlite3.connect(str(target))
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    for old in sorted(backup_dir.glob("antes-*.db"))[:-20]:
        old.unlink(missing_ok=True)
    return str(target)

@router.get("", response_model=DashboardSummary)
def get_dashboard_summary(catalog_id: Optional[int] = Query(None, description="Filtrar métricas por catálogo")):
    conn = get_db_connection()
    cursor = conn.cursor()

    cat_clause = " WHERE catalog_id = ?" if catalog_id else ""
    cat_params = (catalog_id,) if catalog_id else ()

    # 1. Relojes totales
    cursor.execute(f"""
        SELECT 
            COUNT(*) as total_count,
            COALESCE(SUM(total_cost), 0.0) as sum_cost,
            COALESCE(SUM(estimated_value), 0.0) as sum_value
        FROM watches
        {cat_clause}
    """, cat_params)
    w_stats = cursor.fetchone()
    watches_count = w_stats["total_count"]
    watches_cost_total = round(w_stats["sum_cost"], 2)
    watches_value_total = round(w_stats["sum_value"], 2)

    # 2. Desglose específico por posesión:
    # A) Los que tengo ('owned')
    owned_clause = f" WHERE ownership_status = 'owned' {'AND catalog_id = ?' if catalog_id else ''}"
    cursor.execute(f"""
        SELECT 
            COUNT(*) as count,
            COALESCE(SUM(total_cost), 0.0) as sum_cost,
            COALESCE(SUM(estimated_value), 0.0) as sum_value
        FROM watches
        {owned_clause}
    """, cat_params)
    owned_row = cursor.fetchone()
    owned_watches_count = owned_row["count"]
    owned_watches_cost = round(owned_row["sum_cost"], 2)
    owned_watches_value = round(owned_row["sum_value"], 2)
    # La plusvalía solo tiene sentido sobre los relojes que realmente tengo
    profit_or_savings = round(owned_watches_value - owned_watches_cost, 2)

    # B) En taller / montaje ('building')
    building_clause = f" WHERE ownership_status = 'building' {'AND catalog_id = ?' if catalog_id else ''}"
    cursor.execute(f"""
        SELECT 
            COUNT(*) as count,
            COALESCE(SUM(total_cost), 0.0) as sum_cost
        FROM watches
        {building_clause}
    """, cat_params)
    building_row = cursor.fetchone()
    building_watches_count = building_row["count"]
    building_watches_cost = round(building_row["sum_cost"], 2)

    # C) Los que quiero ('planned')
    planned_clause = f" WHERE ownership_status = 'planned' {'AND catalog_id = ?' if catalog_id else ''}"
    cursor.execute(f"""
        SELECT 
            COUNT(*) as count,
            COALESCE(SUM(total_cost), 0.0) as sum_budget
        FROM watches
        {planned_clause}
    """, cat_params)
    planned_row = cursor.fetchone()
    planned_watches_count = planned_row["count"]
    planned_watches_budget = round(planned_row["sum_budget"], 2)

    # 3. Movimientos
    cursor.execute("""
        SELECT 
            COALESCE(SUM(stock), 0) as total_stock,
            COALESCE(SUM(unit_price * stock), 0.0) as total_value
        FROM movements
    """)
    m_stats = cursor.fetchone()
    movements_stock_total = m_stats["total_stock"]
    movements_value_total = round(m_stats["total_value"], 2)

    # 4. Piezas
    cursor.execute("SELECT COUNT(*) as count FROM parts")
    parts_count = cursor.fetchone()["count"]

    cursor.execute("""
        SELECT COALESCE(SUM(price), 0.0) as available_value
        FROM parts 
        WHERE status = 'Disponible'
    """)
    parts_available_value = round(cursor.fetchone()["available_value"], 2)

    # 5. Herramientas
    cursor.execute("SELECT COUNT(*) as count, COALESCE(SUM(CASE WHEN status != 'Por comprar' THEN price ELSE 0 END), 0.0) as value FROM tools")
    t_row = cursor.fetchone()
    tools_count = t_row["count"]
    tools_value_total = round(t_row["value"], 2)

    # 6. Catálogos
    cursor.execute("SELECT COUNT(*) as count FROM catalogs")
    catalogs_count = cursor.fetchone()["count"]

    # Inversión total = Relojes que tengo/taller + Stock de calibres + Piezas disponibles
    total_investment = round(owned_watches_cost + building_watches_cost + movements_value_total + parts_available_value, 2)

    # 7. Wishlist
    cursor.execute("SELECT COUNT(*) as count FROM wishlist")
    wishlist_count = cursor.fetchone()["count"]
    cursor.execute("SELECT COUNT(*) as count, COALESCE(SUM(target_price), 0.0) as total FROM wishlist WHERE status = 'Pendiente'")
    wl_row = cursor.fetchone()
    wishlist_pending_count = wl_row["count"]
    wishlist_pending_total = round(wl_row["total"], 2)

    conn.close()

    return DashboardSummary(
        total_investment=total_investment,
        watches_cost_total=watches_cost_total,
        watches_value_total=watches_value_total,
        profit_or_savings=profit_or_savings,
        watches_count=watches_count,
        owned_watches_count=owned_watches_count,
        owned_watches_cost=owned_watches_cost,
        owned_watches_value=owned_watches_value,
        building_watches_count=building_watches_count,
        building_watches_cost=building_watches_cost,
        planned_watches_count=planned_watches_count,
        planned_watches_budget=planned_watches_budget,
        movements_stock_total=movements_stock_total,
        movements_value_total=movements_value_total,
        parts_count=parts_count,
        parts_available_value=parts_available_value,
        tools_count=tools_count,
        tools_value_total=tools_value_total,
        wishlist_count=wishlist_count,
        wishlist_pending_count=wishlist_pending_count,
        wishlist_pending_total=wishlist_pending_total,
        catalogs_count=catalogs_count
    )

@router.get("/export")
def export_database_json():
    """Genera un volcado completo de toda la base de datos en formato JSON para backups."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM catalogs")
    catalogs = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM watches")
    watches = [dict(r) for r in cursor.fetchall()]

    for w in watches:
        cursor.execute("SELECT * FROM watch_components WHERE watch_id = ?", (w["id"],))
        w["components"] = [dict(c) for c in cursor.fetchall()]

    cursor.execute("SELECT * FROM movements")
    movements = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM parts")
    parts = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM tools")
    tools = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM wishlist")
    wishlist = [dict(r) for r in cursor.fetchall()]

    conn.close()

    return {
        "export_version": "3.0",
        "catalogs": catalogs,
        "watches": watches,
        "movements": movements,
        "parts": parts,
        "tools": tools,
        "wishlist": wishlist
    }

@router.post("/reset-seed")
def reset_to_seed(confirm: str = Query("", description="Debe ser BORRAR")):
    """Reinicia la base de datos a los datos de ejemplo. Exige confirm=BORRAR y guarda antes una copia."""
    if confirm != "BORRAR":
        raise HTTPException(status_code=400, detail="Para borrar todo y cargar el ejemplo hay que confirmar con BORRAR")
    safety_backup("ejemplo")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM watch_components;")
    cursor.execute("DELETE FROM watches;")
    cursor.execute("DELETE FROM catalogs;")
    cursor.execute("DELETE FROM movements;")
    cursor.execute("DELETE FROM parts;")
    cursor.execute("DELETE FROM tools;")
    cursor.execute("DELETE FROM wishlist;")
    conn.commit()

    seed_initial_data(conn)
    conn.close()
    return {"message": "Base de datos restaurada con datos profesionales exitosamente"}

# Columnas que se restauran por tabla (en orden de dependencias)
IMPORT_TABLES = {
    "catalogs": ["id", "name", "slug", "description", "icon", "color", "created_at"],
    "watches": ["id", "catalog_id", "name", "style", "movement_name", "status", "ownership_status", "total_cost",
                "estimated_value", "image_url", "notes", "created_at", "updated_at"],
    "movements": ["id", "model", "supplier", "unit_price", "stock", "bph", "power_reserve", "notes", "image_url", "created_at"],
    "parts": ["id", "part_type", "name", "compatibility", "supplier", "price", "finish_notes", "status",
              "assigned_watch_id", "buy_url", "image_url", "created_at"],
    "tools": ["id", "name", "category", "supplier", "price", "status", "notes", "buy_url", "image_url", "created_at"],
    "wishlist": ["id", "item_name", "category", "buy_url", "target_price", "priority", "status", "notes", "image_url", "created_at"],
}
COMPONENT_COLUMNS = ["id", "watch_id", "component_type", "name", "price", "supplier", "part_id", "status"]

def _insert_rows(cursor, table: str, columns: list, rows: list):
    for row in rows:
        present = [c for c in columns if c in row and row[c] is not None]
        if not present:
            continue
        cursor.execute(
            f"INSERT INTO {table} ({', '.join(present)}) VALUES ({', '.join('?' * len(present))})",
            [row[c] for c in present],
        )

@router.post("/import")
def import_database_json(backup: Dict[str, Any] = Body(...)):
    """Restaura un backup JSON generado por /export, reemplazando todos los datos actuales."""
    if not any(k in backup for k in IMPORT_TABLES):
        raise HTTPException(status_code=400, detail="El archivo no parece un backup válido de Horology Studio")

    safety_backup("restaurar")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        for table in ["watch_components", "parts", "watches", "catalogs", "movements", "tools", "wishlist"]:
            cursor.execute(f"DELETE FROM {table};")

        for table, columns in IMPORT_TABLES.items():
            _insert_rows(cursor, table, columns, backup.get(table) or [])

        for w in backup.get("watches") or []:
            comps = [{**c, "watch_id": w["id"]} for c in (w.get("components") or [])]
            _insert_rows(cursor, "watch_components", COMPONENT_COLUMNS, comps)

        conn.commit()
    except Exception as exc:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=f"No se pudo importar el backup: {exc}")

    conn.close()
    return {"message": "Backup restaurado correctamente"}

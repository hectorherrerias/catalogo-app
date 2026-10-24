import os
import sqlite3
from pathlib import Path
from typing import Generator

DB_PATH = os.getenv("DATABASE_PATH", str(Path(__file__).resolve().parent.parent / "data" / "catalog.db"))
UPLOADS_DIR = Path(os.getenv("UPLOADS_DIR", str(Path(DB_PATH).resolve().parent / "uploads")))

# Iconos antiguos guardados como nombre de Lucide -> emoji equivalente
LEGACY_ICON_MAP = {"watch": "⌚", "briefcase": "💼", "sparkles": "✨", "folder": "📁"}

def get_db_connection() -> sqlite3.Connection:
    """Retorna una conexión a SQLite con configuración optimizada y WAL."""
    db_file = Path(DB_PATH)
    db_file.parent.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(str(db_file), timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn

def init_db():
    """Inicializa y migra el esquema de la base de datos."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Tabla de Catálogos Independientes (Colecciones de relojes)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS catalogs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT,
        description TEXT,
        icon TEXT DEFAULT '⌚',
        color TEXT DEFAULT '#c9a36a',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Tabla de Relojes / Proyectos
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS watches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        catalog_id INTEGER,
        name TEXT NOT NULL,
        style TEXT,
        movement_name TEXT,
        status TEXT NOT NULL DEFAULT 'Montado',       -- 'Montado', 'En piezas', 'En proyecto'
        ownership_status TEXT NOT NULL DEFAULT 'owned', -- 'owned' (Los que tengo), 'building' (En proceso/taller), 'planned' (Los que quiero)
        total_cost REAL NOT NULL DEFAULT 0.0,
        estimated_value REAL NOT NULL DEFAULT 0.0,
        image_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (catalog_id) REFERENCES catalogs(id) ON DELETE SET NULL
    );
    """)

    # Migración de columnas en caso de tabla existente
    cursor.execute("PRAGMA table_info(watches);")
    columns = [row["name"] for row in cursor.fetchall()]
    if "catalog_id" not in columns:
        cursor.execute("ALTER TABLE watches ADD COLUMN catalog_id INTEGER REFERENCES catalogs(id) ON DELETE SET NULL;")
    if "ownership_status" not in columns:
        cursor.execute("ALTER TABLE watches ADD COLUMN ownership_status TEXT NOT NULL DEFAULT 'owned';")

    # 3. Componentes desglosados por Reloj
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS watch_components (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        watch_id INTEGER NOT NULL,
        component_type TEXT NOT NULL, -- 'Caja', 'Movimiento', 'Dial', 'Agujas', 'Bisel', 'Cristal', 'Brazalete', 'Otro'
        name TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0.0,
        supplier TEXT,
        part_id INTEGER,
        status TEXT DEFAULT 'Recibido', -- 'Recibido', 'Pedido', 'Pendiente de compra'
        FOREIGN KEY (watch_id) REFERENCES watches(id) ON DELETE CASCADE
    );
    """)
    cursor.execute("PRAGMA table_info(watch_components);")
    comp_columns = [row["name"] for row in cursor.fetchall()]
    if "status" not in comp_columns:
        cursor.execute("ALTER TABLE watch_components ADD COLUMN status TEXT DEFAULT 'Recibido';")

    # 4. Tabla de Movimientos / Calibres
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model TEXT NOT NULL,
        supplier TEXT,
        unit_price REAL NOT NULL DEFAULT 0.0,
        stock INTEGER NOT NULL DEFAULT 0,
        bph INTEGER DEFAULT 21600,
        power_reserve INTEGER DEFAULT 41,
        notes TEXT,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 5. Tabla de Piezas y Componentes individuales
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS parts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        part_type TEXT NOT NULL, -- 'Dial', 'Agujas', 'Caja', 'Brazalete', 'Bisel', 'Cristal', 'Corona', 'Rotor', 'Otro'
        name TEXT NOT NULL,
        compatibility TEXT,
        supplier TEXT,
        price REAL NOT NULL DEFAULT 0.0,
        finish_notes TEXT,
        status TEXT NOT NULL DEFAULT 'Disponible', -- 'Disponible', 'Asignado', 'Agotado'
        assigned_watch_id INTEGER,
        buy_url TEXT,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assigned_watch_id) REFERENCES watches(id) ON DELETE SET NULL
    );
    """)

    # 6. Tabla de Herramientas de Taller / Modding
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Herramienta', -- 'Prensa', 'Desmagnetizador', 'Pinzas', 'Aceites / Grasas', 'Lupas', 'Otros'
        supplier TEXT,
        price REAL NOT NULL DEFAULT 0.0,
        status TEXT NOT NULL DEFAULT 'Disponible',
        notes TEXT,
        buy_url TEXT,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 7. Tabla de Wishlist
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS wishlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Pieza',
        buy_url TEXT,
        target_price REAL NOT NULL DEFAULT 0.0,
        priority TEXT NOT NULL DEFAULT 'Media',
        status TEXT NOT NULL DEFAULT 'Pendiente',
        notes TEXT,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Índices para las consultas más frecuentes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_watches_catalog ON watches(catalog_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_components_watch ON watch_components(watch_id);")

    # Migrar iconos de catálogo antiguos (texto) a emoji
    for legacy, emoji in LEGACY_ICON_MAP.items():
        cursor.execute("UPDATE catalogs SET icon = ? WHERE icon = ?", (emoji, legacy))

    conn.commit()
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    # Datos de ejemplo solo en una instalación nueva: si el usuario borra todo más adelante, no se
    # vuelven a meter relojes inventados al reiniciar (la marca .seeded indica que ya se instaló)
    seeded_mark = Path(DB_PATH).parent / ".seeded"
    cursor.execute("SELECT COUNT(*) as count FROM catalogs;")
    if cursor.fetchone()["count"] == 0 and not seeded_mark.exists():
        seed_initial_data(conn)
    seeded_mark.touch(exist_ok=True)

    conn.close()

def seed_initial_data(conn: sqlite3.Connection):
    """Inserta catálogos y datos profesionales de demostración."""
    cursor = conn.cursor()

    # --- CATÁLOGOS ---
    catalogs_data = [
        ("Colección Personal", "personal", "Mis relojes propios de uso diario y ocasiones especiales.", "⌚", "#c9a36a"),
        ("Mods & Encargos", "mods-encargos", "Relojes montados para venta, clientes o amigos.", "💼", "#5b9bd5"),
        ("Futuros Builds & Conceptos", "futuros-builds", "Proyectos soñados con presupuesto y desglose de piezas.", "✨", "#9b7fd4")
    ]
    cursor.executemany("""
        INSERT INTO catalogs (name, slug, description, icon, color)
        VALUES (?, ?, ?, ?, ?)
    """, catalogs_data)

    cursor.execute("SELECT id, slug FROM catalogs")
    cat_map = {row["slug"]: row["id"] for row in cursor.fetchall()}
    cat_personal = cat_map.get("personal", 1)
    cat_mods = cat_map.get("mods-encargos", 1)
    cat_futuros = cat_map.get("futuros-builds", 1)

    # --- MOVIMIENTOS ---
    movements_data = [
        ("NH34 GMT", "AliExpress - Alix Time Store", 48.50, 2, 21600, 41, "Calibre automático con 4ª aguja GMT (24h) para doble huso horario.", None),
        ("NH35A (Con Fecha)", "NamokiMODS", 36.00, 3, 21600, 41, "Calibre estándar robusto, fechador blanco a las 3h, 41 horas de reserva.", None),
        ("NH38 (No Date / Open Heart)", "Lucius Atelier", 42.00, 1, 21600, 41, "Sin posición fantasma en la tija, balance visto para esferas Open Heart.", None),
        ("PT5000 Hi-Beat", "HK Precision Movement", 55.00, 1, 28800, 38, "Clon ETA 2824 de alta frecuencia (28.800 bph / 4Hz) para barrido de segundero continuo.", None)
    ]
    cursor.executemany("""
        INSERT INTO movements (model, supplier, unit_price, stock, bph, power_reserve, notes, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, movements_data)

    # --- PIEZAS ---
    parts_data = [
        ("Dial", "Dial Santos Blanco Esmalte con Romanos", "Seiko 28.5mm / NH35", "DS Watch Club", 28.50, "Acabado brillante esmaltado, índices negros estilo parisino clásico.", "Disponible", None, "https://aliexpress.com", None),
        ("Agujas", "Juego Agujas Espada Azul Cobalto", "Calibres NH35/NH36/NH34", "Lucius Atelier", 16.00, "Acabado templado térmico azul brillante, pulido espejo.", "Disponible", None, "https://luciusatelier.com", None),
        ("Caja", "Caja Cuadrada Estilo Santos 35mm", "Acero 316L / NH35", "NamokiMODS", 58.00, "Bisel pulido a espejo con tornillos decorativos, carrura cepillada.", "Disponible", None, "https://namokimods.com", None),
        ("Bisel", "Insert Cerámico Bruce Wayne (Negro / Gris)", "Caja Sub 38mm x 30.6mm", "Caroline Mods Store", 19.50, "Cerámica de zirconio con números grabados en platino PVD.", "Disponible", None, "https://aliexpress.com", None),
        ("Brazalete", "Brazalete Jubilee 20mm Acero 316L", "Asas 20mm curvas", "StrapCo Official", 32.00, "Eslabones sólidos macizos con microajuste y cierre fresado.", "Disponible", None, "https://aliexpress.com", None),
        ("Cristal", "Cristal Zafiro Doble Cúpula con AR Azul", "Diámetro 30.5mm x 2.3mm", "Crystaltimes", 27.00, "Zafiro sintético 9 Mohs con tratamiento antirreflejo interior.", "Disponible", None, "https://crystaltimes.net", None)
    ]
    cursor.executemany("""
        INSERT INTO parts (part_type, name, compatibility, supplier, price, finish_notes, status, assigned_watch_id, buy_url, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, parts_data)

    # --- RELOJES CON CLASIFICACIÓN EXACTA: 'owned' (Tengo), 'building' (Taller), 'planned' (Quiero) ---
    watches_data = [
        (
            cat_personal,
            "Submariner 'Bruce Wayne' GMT",
            "Bruce Wayne / GMT Master II",
            "NH34 GMT",
            "Montado",
            "owned", # ¡Lo tengo!
            248.50,
            420.00,
            None,
            "Reloj montado personal de uso diario. Aguja GMT verde esmeralda y bisel cerámico bicolor. Sumergibilidad testeada."
        ),
        (
            cat_personal,
            "Santos de Cartier Mod Esmalte Blanco",
            "Santos de Cartier",
            "NH35A (Con Fecha)",
            "Montado",
            "owned", # ¡Lo tengo!
            178.50,
            350.00,
            None,
            "Caja cuadrada 35mm con acabado cepillado satinado, dial blanco con números romanos y agujas cobalto azuladas al calor."
        ),
        (
            cat_mods,
            "Datejust 36 'Wimbledon' Fluted",
            "Datejust 36",
            "NH35A (Con Fecha)",
            "En piezas",
            "building", # ¡En taller / En proceso!
            165.00,
            310.00,
            None,
            "En montaje sobre la mesa de trabajo. Bisel estriado de acero con dial gris pizarra y números romanos verdes Wimbledon."
        ),
        (
            cat_futuros,
            "Royal Oak 39mm 'Tiffany Blue' Mod",
            "Royal Oak 15202",
            "PT5000 Hi-Beat",
            "En proyecto",
            "planned", # ¡Lo que quiero!
            215.00,
            480.00,
            None,
            "Futuro proyecto soñado. Caja octogonal integrada de 39mm, dial tapisserie Tiffany Blue y calibre PT5000 a 28.800 bph."
        )
    ]

    for w in watches_data:
        cursor.execute("""
            INSERT INTO watches (catalog_id, name, style, movement_name, status, ownership_status, total_cost, estimated_value, image_url, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, w)
        watch_id = cursor.lastrowid

        # Insertar desglose de piezas para cada reloj
        if "Bruce Wayne" in w[1]:
            components = [
                ("Movimiento", "Calibre Seiko NH34 GMT automático", 48.50, "Alix Time Store", "Recibido"),
                ("Caja", "Caja Submariner 40mm Acero 316L corona 3h", 55.00, "Tandorio Store", "Recibido"),
                ("Dial", "Dial Negro Sunburst OEM Seiko Mod 28.5mm", 28.00, "DS Watch Club", "Recibido"),
                ("Agujas", "Juego Mercedes BGW9 + Aguja GMT Verde", 17.50, "Caroline Mods", "Recibido"),
                ("Bisel", "Insert cerámico Bruce Wayne Negro/Gris", 19.50, "Caroline Mods", "Recibido"),
                ("Cristal", "Zafiro plano con lupa cíclope 2.5x con AR", 26.00, "Crystaltimes", "Recibido"),
                ("Brazalete", "Brazalete Jubilee 20mm cierre Glidelock", 38.00, "StrapCo Official", "Recibido"),
                ("Otro", "Juntas tóricas siliconadas + tija NH34 extra", 16.00, "MiNT Watch Parts", "Recibido")
            ]
        elif "Santos" in w[1]:
            components = [
                ("Movimiento", "Calibre Seiko NH35A con disco fecha blanco", 36.00, "NamokiMODS", "Recibido"),
                ("Caja", "Caja Cuadrada Santos 35mm Bisel Pulido", 58.00, "NamokiMODS", "Recibido"),
                ("Dial", "Dial Santos Blanco Esmalte con Romanos", 28.50, "DS Watch Club", "Recibido"),
                ("Agujas", "Agujas Espada azul cobalto templadas", 16.00, "Lucius Atelier", "Recibido"),
                ("Brazalete", "Brazalete eslabones con pasador rápido", 40.00, "AliExpress Store", "Recibido")
            ]
        elif "Wimbledon" in w[1]:
            components = [
                ("Movimiento", "Calibre Seiko NH35A", 36.00, "NamokiMODS", "Recibido"),
                ("Caja", "Caja 36mm Datejust con bisel estriado Fluted", 49.00, "MiNT Store", "Recibido"),
                ("Dial", "Dial Gris Wimbledon números romanos verdes", 32.00, "DS Watch Club", "Recibido"),
                ("Agujas", "Agujas Bastón pulidas plata con BGW9", 14.00, "Alix Store", "Recibido"),
                ("Brazalete", "Brazalete Jubilee 20mm cepillado/pulido", 34.00, "StrapCo", "Pedido")
            ]
        else: # Royal Oak Tiffany
            components = [
                ("Movimiento", "Calibre PT5000 Hi-Beat 28.800 bph", 55.00, "HK Precision", "Pendiente de compra"),
                ("Caja", "Caja Octogonal 39mm con bisel pulido 8 tornillos", 68.00, "NamokiMODS", "Pendiente de compra"),
                ("Dial", "Dial Tiffany Blue Grande Tapisserie 28.5mm", 38.00, "Lucius Atelier", "Pendiente de compra"),
                ("Agujas", "Juego Royal Oak Baton con Lume C3", 16.00, "Alix Store", "Pendiente de compra"),
                ("Brazalete", "Brazalete integrado con cierre mariposa", 38.00, "NamokiMODS", "Pendiente de compra")
            ]

        calc_cost = 0.0
        for comp in components:
            calc_cost += comp[2]
            cursor.execute("""
                INSERT INTO watch_components (watch_id, component_type, name, price, supplier, status)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (watch_id, comp[0], comp[1], comp[2], comp[3], comp[4]))

        cursor.execute("UPDATE watches SET total_cost = ? WHERE id = ?", (round(calc_cost, 2), watch_id))

    # --- HERRAMIENTAS DE TALLER ---
    tools_data = [
        ("Prensa de cristales con matrices de aluminio", "Prensa", "Amazon", 32.00, "Disponible", "Imprescindible para prensar zafiros sin rotura.", "https://amazon.es", None),
        ("Desmagnetizador profesional de pulsador", "Desmagnetizador", "AliExpress", 14.50, "Disponible", "Para eliminar magnetismo de espirales de volante.", "https://aliexpress.com", None),
        ("Juego de pinzas antimagnéticas Dumont Style #2 y #3", "Pinzas", "Esslinger", 24.00, "Disponible", "Puntas ultra finas para colocación de agujas.", "https://esslinger.com", None),
        ("Grasa de silicona Fomblin para juntas de estanqueidad", "Aceites / Grasas", "CousinsUK", 18.00, "Disponible", "Para lubricar juntas de caja y corona.", "https://cousinsuk.com", None)
    ]
    cursor.executemany("""
        INSERT INTO tools (name, category, supplier, price, status, notes, buy_url, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, tools_data)

    # --- WISHLIST ---
    wishlist_data = [
        ("Dial Meteorito Auténtico Muonionalusta 28.5mm", "Pieza", "https://luciusatelier.com", 89.00, "Alta", "Pendiente", "Pieza de meteorito tratado al ácido Widmanstätten.", None),
        ("Calibre Sellita SW200-1 Swiss Made", "Movimiento", "https://ebay.com", 145.00, "Baja", "Pendiente", "Para build premium 28.800 bph genuino suizo.", None)
    ]
    cursor.executemany("""
        INSERT INTO wishlist (item_name, category, buy_url, target_price, priority, status, notes, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, wishlist_data)

    conn.commit()

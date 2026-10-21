from typing import List, Optional
from pydantic import BaseModel, Field

# --- CATÁLOGOS / COLECCIONES INDEPENDIENTES ---
class CatalogBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    slug: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = "⌚"
    color: Optional[str] = "#c9a36a"

class CatalogCreate(CatalogBase):
    pass

class CatalogUpdate(CatalogBase):
    pass

class CatalogResponse(CatalogBase):
    id: int
    created_at: Optional[str] = None
    watches_count: Optional[int] = 0
    owned_count: Optional[int] = 0
    planned_count: Optional[int] = 0
    total_cost: Optional[float] = 0.0
    total_value: Optional[float] = 0.0

# --- COMPONENTES DE RELOJ ---
class WatchComponentBase(BaseModel):
    component_type: str = Field(..., description="Caja, Movimiento, Dial, Agujas, Bisel, Cristal, Brazalete, Otro")
    name: str = Field(..., min_length=1)
    price: float = Field(0.0, ge=0)
    supplier: Optional[str] = None
    part_id: Optional[int] = None
    status: Optional[str] = "Recibido" # 'Recibido', 'Pedido', 'Pendiente de compra'

class WatchComponentCreate(WatchComponentBase):
    pass

class WatchComponentStatusUpdate(BaseModel):
    status: str = Field(..., description="Recibido, Pedido, Pendiente de compra")

class WatchComponentResponse(WatchComponentBase):
    id: int
    watch_id: int

# --- RELOJES / PROYECTOS ---
class WatchBase(BaseModel):
    catalog_id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=200)
    style: Optional[str] = None
    movement_name: Optional[str] = None
    status: str = Field("Montado", description="Montado, En piezas, En proyecto")
    ownership_status: str = Field("owned", description="'owned' (Los que tengo), 'building' (En proceso/taller), 'planned' (Los que quiero)")
    estimated_value: float = Field(0.0, ge=0)
    image_url: Optional[str] = None
    notes: Optional[str] = None

class WatchCreate(WatchBase):
    components: Optional[List[WatchComponentCreate]] = []

class WatchUpdate(WatchBase):
    components: Optional[List[WatchComponentCreate]] = None

class WatchOwnershipUpdate(BaseModel):
    ownership_status: str = Field(..., description="owned, building, planned")

class WatchResponse(WatchBase):
    id: int
    total_cost: float
    catalog_name: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    components: List[WatchComponentResponse] = []

# --- MOVIMIENTOS / CALIBRES ---
class MovementBase(BaseModel):
    model: str = Field(..., min_length=1)
    supplier: Optional[str] = None
    unit_price: float = Field(0.0, ge=0)
    stock: int = Field(0, ge=0)
    bph: Optional[int] = 21600
    power_reserve: Optional[int] = 41
    notes: Optional[str] = None
    image_url: Optional[str] = None

class MovementCreate(MovementBase):
    pass

class MovementUpdate(MovementBase):
    pass

class MovementResponse(MovementBase):
    id: int
    created_at: Optional[str] = None

class MovementStockUpdate(BaseModel):
    delta: int = Field(..., description="+1 para añadir, -1 para restar stock")

# --- PIEZAS Y COMPONENTES ---
class PartBase(BaseModel):
    part_type: str = Field(..., description="Dial, Agujas, Caja, Brazalete, Bisel, Cristal, Corona, Rotor, Otro")
    name: str = Field(..., min_length=1)
    compatibility: Optional[str] = None
    supplier: Optional[str] = None
    price: float = Field(0.0, ge=0)
    finish_notes: Optional[str] = None
    status: str = Field("Disponible", description="Disponible, Asignado, Agotado")
    assigned_watch_id: Optional[int] = None
    buy_url: Optional[str] = None
    image_url: Optional[str] = None

class PartCreate(PartBase):
    pass

class PartUpdate(PartBase):
    pass

class PartResponse(PartBase):
    id: int
    created_at: Optional[str] = None
    assigned_watch_name: Optional[str] = None

# --- HERRAMIENTAS DE TALLER ---
class ToolBase(BaseModel):
    name: str = Field(..., min_length=1)
    category: str = Field("Herramienta", description="Prensa, Desmagnetizador, Pinzas, Aceites / Grasas, Lupas, Otros")
    supplier: Optional[str] = None
    price: float = Field(0.0, ge=0)
    status: str = Field("Disponible", description="Disponible, Por comprar, Prestado")
    notes: Optional[str] = None
    buy_url: Optional[str] = None
    image_url: Optional[str] = None

class ToolCreate(ToolBase):
    pass

class ToolUpdate(ToolBase):
    pass

class ToolResponse(ToolBase):
    id: int
    created_at: Optional[str] = None

# --- WISHLIST ---
class WishlistBase(BaseModel):
    item_name: str = Field(..., min_length=1)
    category: str = Field("Pieza", description="Reloj, Movimiento, Pieza, Herramienta")
    buy_url: Optional[str] = None
    target_price: float = Field(0.0, ge=0)
    priority: str = Field("Media", description="Alta, Media, Baja")
    status: str = Field("Pendiente", description="Pendiente, Comprado, Descartado")
    notes: Optional[str] = None
    image_url: Optional[str] = None

class WishlistCreate(WishlistBase):
    pass

class WishlistUpdate(WishlistBase):
    pass

class WishlistResponse(WishlistBase):
    id: int
    created_at: Optional[str] = None

class WishlistConvertToInventory(BaseModel):
    inventory_type: str = Field("part", description="'part', 'movement' o 'tool'")
    actual_price: Optional[float] = Field(None, ge=0)
    supplier: Optional[str] = None
    notes: Optional[str] = None

# --- RESUMEN / DASHBOARD ---
class DashboardSummary(BaseModel):
    total_investment: float
    watches_cost_total: float
    watches_value_total: float
    profit_or_savings: float
    watches_count: int
    # Desglose específico para "Lo que tengo", "En taller" y "Lo que quiero"
    owned_watches_count: int
    owned_watches_cost: float
    owned_watches_value: float
    building_watches_count: int
    building_watches_cost: float
    planned_watches_count: int
    planned_watches_budget: float
    movements_stock_total: int
    movements_value_total: float
    parts_count: int
    parts_available_value: float
    tools_count: int
    tools_value_total: float
    wishlist_count: int
    wishlist_pending_count: int
    wishlist_pending_total: float
    catalogs_count: int

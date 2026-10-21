from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.database import init_db, UPLOADS_DIR
from app.routers import catalogs, watches, movements, parts, tools, wishlist, summary, uploads

APP_VERSION = "3.0.0"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicializar y migrar base de datos al arrancar
    init_db()
    yield

app = FastAPI(
    title="Horology Studio — Catálogo de Mods de Relojes",
    description="Gestión de colecciones de relojes, catálogos independientes, calibres, piezas, herramientas y taller.",
    version=APP_VERSION,
    lifespan=lifespan
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Incluir routers
app.include_router(catalogs.router)
app.include_router(watches.router)
app.include_router(movements.router)
app.include_router(parts.router)
app.include_router(tools.router)
app.include_router(wishlist.router)
app.include_router(summary.router)
app.include_router(uploads.router)

@app.get("/")
async def serve_index():
    index_file = TEMPLATES_DIR / "index.html"
    return FileResponse(str(index_file), headers={"Cache-Control": "no-cache"})

@app.get("/health")
async def health_check():
    return {"status": "ok", "app": "horology-studio", "version": APP_VERSION}

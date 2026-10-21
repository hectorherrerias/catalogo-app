import uuid
from fastapi import APIRouter, File, HTTPException, UploadFile
from app.database import UPLOADS_DIR

router = APIRouter(prefix="/api/uploads", tags=["Imágenes"])

ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
}
MAX_BYTES = 10 * 1024 * 1024  # 10 MB

@router.post("", status_code=201)
async def upload_image(file: UploadFile = File(...)):
    """Guarda una foto en el volumen persistente y devuelve su URL pública."""
    ext = ALLOWED_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(status_code=415, detail="Formato no soportado. Usa JPG, PNG, WEBP, GIF o AVIF.")

    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="La imagen supera los 10 MB.")
    if not data:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    (UPLOADS_DIR / filename).write_bytes(data)
    return {"url": f"/uploads/{filename}"}

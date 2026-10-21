# ⌚ Horology Studio — catálogo de relojes y mods

Aplicación web autohospedada para gestionar tu colección de relojes y tu taller de modding: relojes y proyectos con su despiece y coste real, calibres en stock, piezas sueltas, herramientas y lista de deseos.

Construida con **FastAPI + SQLite** en el backend y un frontend sin dependencias de build (HTML, CSS y JavaScript). Pensada para correr en Docker en un mini PC de casa.

## Qué incluye

- **Resumen**: valor de la colección, plusvalía, lo que hay en el taller, lo pendiente de comprar, gasto por tipo de pieza, piezas por llegar y alertas de stock.
- **Relojes y proyectos**: separa lo que tienes, lo que estás montando y lo que quieres construir. Cada reloj tiene su despiece y el coste total se calcula sumando las piezas. Ficha lateral con estado de cada pieza (recibida / pedida / por comprar), duplicado de builds y cambio rápido de situación.
- **Calibres** con stock ajustable en un clic, frecuencia y reserva de marcha.
- **Piezas** sueltas con compatibilidad, proveedor, enlace de compra y asignación a un reloj.
- **Herramientas** del banco de trabajo.
- **Lista de deseos** con prioridad y precio objetivo; al comprarla pasa al inventario con un clic.
- **Colecciones** independientes (catálogos) con icono y color.
- **Fotos**: sube imágenes desde el móvil o el PC (se guardan en `data/uploads`) o pega una URL.
- **Backup**: descarga un JSON completo y restáuralo cuando quieras.
- Tema claro/oscuro, diseño adaptado a móvil, atajos de teclado (`/` buscar, `n` nuevo, `Esc` cerrar).

## Despliegue con Docker

```bash
git clone https://github.com/hectorherrerias/catalogo-app.git
cd catalogo-app
docker compose up -d --build
```

La app queda en `http://<ip-del-servidor>:8010`. Para usar otro puerto:

```bash
APP_PORT=8090 docker compose up -d --build
```

Los datos (base de datos SQLite y fotos) viven en `./data`, montado como volumen: actualizar o recrear el contenedor no los borra.

### Actualizar

```bash
git pull
docker compose up -d --build
```

## Desarrollo local

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

La primera vez que arranca con la base de datos vacía carga datos de ejemplo. Puedes volver a cargarlos (borrando lo que haya) desde el botón de la barra lateral.

## Estructura

```
app/
├── main.py            # App FastAPI, estáticos y /uploads
├── database.py        # Esquema SQLite, migraciones y datos de ejemplo
├── models.py          # Modelos Pydantic
├── routers/           # API: watches, movements, parts, tools, wishlist, catalogs, summary, uploads
├── static/css/styles.css
├── static/js/app.js
└── templates/index.html
data/                  # Volumen persistente (no se sube a git)
```

La documentación interactiva de la API está en `/docs`.

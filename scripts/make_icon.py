"""Genera los iconos de Horology Studio (reloj de latón a las 10:10 sobre tinta).

Uso (requiere Pillow): python scripts/make_icon.py app/static/icons <carpeta-para-la-vista-previa>
"""
import math
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

S = 2048
C = S / 2


def hexc(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lin_grad(size, c1, c2, angle=45, mid=None):
    g = Image.linear_gradient('L').resize((size * 2, size * 2)).rotate(angle, resample=Image.BICUBIC)
    g = g.crop((size // 2, size // 2, size // 2 + size, size // 2 + size))
    return ImageOps.colorize(g, hexc(c1), hexc(c2), mid=hexc(mid) if mid else None)


def rad_grad(size, inner, outer, scale=1.0, offset=(0, 0)):
    big = int(size * scale)
    g = Image.radial_gradient('L').resize((big, big))
    canvas = Image.new('L', (size, size), 255)
    canvas.paste(g, (int((size - big) / 2 + offset[0]), int((size - big) / 2 + offset[1])))
    return ImageOps.colorize(canvas, hexc(inner), hexc(outer))


def circle_mask(r, cx=C, cy=C, blur=0):
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m


def pt(r, deg, cx=C, cy=C):
    a = math.radians(deg)
    return (cx + r * math.sin(a), cy - r * math.cos(a))


def paste_shape(img, fill_img, mask):
    img.paste(fill_img, (0, 0), mask)


def render(content_scale=1.0):
    img = rad_grad(S, '#2b241b', '#090807', scale=2.0, offset=(0, -S * 0.28)).convert('RGBA')

    sc = content_scale
    R = S * 0.335 * sc            # radio de la caja
    brass = lin_grad(S, '#fff0c8', '#7a5520', angle=45, mid='#d4ad6a').convert('RGBA')
    brass_dark = lin_grad(S, '#6e4c1c', '#e9cd93', angle=45, mid='#a98245').convert('RGBA')

    # Sombra de la caja
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse((C - R * 1.02, C - R * 0.95 + S * 0.03, C + R * 1.02, C + R * 1.09 + S * 0.03), fill=(0, 0, 0, 190))
    sd.rounded_rectangle((C - R * 0.42, C - R * 1.33, C + R * 0.42, C + R * 1.33 + S * 0.03), radius=R * 0.1, fill=(0, 0, 0, 150))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(S * 0.03)))

    # Correa de piel con pespunte
    sw = R * 0.98
    strap_mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(strap_mask).rounded_rectangle((C - sw / 2, -S * 0.1, C + sw / 2, S * 1.1), radius=sw * 0.12, fill=255)
    leather = lin_grad(S, '#5a3f27', '#22170e', angle=0, mid='#3d2a1a').convert('RGBA')
    paste_shape(img, leather, strap_mask)
    sdraw = ImageDraw.Draw(img)
    stitch = (196, 160, 104, 255)
    for side in (-1, 1):
        x = C + side * sw * 0.40
        y = 0
        while y < S:
            sdraw.line((x, y, x, y + S * 0.016), fill=stitch, width=int(S * 0.0045))
            y += S * 0.03
    # Sombreado lateral de la correa
    edge = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    ed.rectangle((C - sw / 2, 0, C - sw / 2 + sw * 0.06, S), fill=(0, 0, 0, 90))
    ed.rectangle((C + sw / 2 - sw * 0.06, 0, C + sw / 2, S), fill=(0, 0, 0, 90))
    img = Image.alpha_composite(img, Image.composite(edge.filter(ImageFilter.GaussianBlur(S * 0.006)), Image.new('RGBA', (S, S), (0, 0, 0, 0)), strap_mask))

    # Sombra de la caja sobre la correa
    cshadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(cshadow).ellipse((C - R * 1.08, C - R * 1.0 + S * 0.025, C + R * 1.08, C + R * 1.16 + S * 0.025), fill=(0, 0, 0, 200))
    img = Image.alpha_composite(img, cshadow.filter(ImageFilter.GaussianBlur(S * 0.025)))

    # Asas (lugs) cortas
    lug_mask = Image.new('L', (S, S), 0)
    ld = ImageDraw.Draw(lug_mask)
    for side in (-1, 1):
        x = C + side * R * 0.40
        w = R * 0.19
        for vy in (-1, 1):
            y1, y2 = (C - R * 1.12, C - R * 0.7) if vy < 0 else (C + R * 0.7, C + R * 1.12)
            ld.rounded_rectangle((x - w / 2, y1, x + w / 2, y2), radius=w * 0.45, fill=255)
    paste_shape(img, brass_dark, lug_mask)

    # Corona
    crown_mask = Image.new('L', (S, S), 0)
    cd = ImageDraw.Draw(crown_mask)
    cw, ch = R * 0.16, R * 0.30
    cd.rounded_rectangle((C + R * 0.93, C - ch / 2, C + R * 0.93 + cw, C + ch / 2), radius=cw * 0.35, fill=255)
    paste_shape(img, brass, crown_mask)
    grooves = ImageDraw.Draw(img)
    for i in range(1, 6):
        gy = C - ch / 2 + ch * i / 6
        grooves.line((C + R * 0.99, gy, C + R * 0.93 + cw - R * 0.02, gy), fill=(90, 62, 24, 255), width=int(S * 0.004))

    # Caja y bisel
    paste_shape(img, brass, circle_mask(R))
    paste_shape(img, brass_dark, circle_mask(R * 0.915))
    paste_shape(img, brass, circle_mask(R * 0.875))

    # Esfera
    Rd = R * 0.835
    dial = rad_grad(S, '#2a241c', '#0d0b09', scale=1.0 * sc * 0.6, offset=(-S * 0.03 * sc, -S * 0.05 * sc)).convert('RGBA')
    paste_shape(img, dial, circle_mask(Rd))
    # Viñeteado interior de la esfera
    vign = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(vign).ellipse((C - Rd, C - Rd, C + Rd, C + Rd), outline=(0, 0, 0, 160), width=int(Rd * 0.08))
    vign = vign.filter(ImageFilter.GaussianBlur(Rd * 0.04))
    img = Image.alpha_composite(img, Image.composite(vign, Image.new('RGBA', (S, S), (0, 0, 0, 0)), circle_mask(Rd)))

    d = ImageDraw.Draw(img)
    gold = (236, 211, 156, 255)
    gold_dim = (150, 124, 82, 255)

    # Pista de minutos
    for m in range(60):
        if m % 5:
            x, y = pt(Rd * 0.925, m * 6)
            r = Rd * 0.011
            d.ellipse((x - r, y - r, x + r, y + r), fill=gold_dim)

    # Índices
    def index(deg, r_out, r_in, w, color):
        p1, p2 = pt(r_out, deg), pt(r_in, deg)
        ang = math.radians(deg)
        dx, dy = math.cos(ang) * w / 2, math.sin(ang) * w / 2
        d.polygon([(p1[0] - dx, p1[1] - dy), (p1[0] + dx, p1[1] + dy), (p2[0] + dx, p2[1] + dy), (p2[0] - dx, p2[1] - dy)], fill=color)

    for h in range(12):
        deg = h * 30
        if h == 0:
            for off in (-3.2, 3.2):
                index(deg + off, Rd * 0.87, Rd * 0.66, Rd * 0.055, gold)
        elif h % 3 == 0:
            index(deg, Rd * 0.87, Rd * 0.66, Rd * 0.07, gold)
        else:
            index(deg, Rd * 0.87, Rd * 0.73, Rd * 0.045, gold)

    # Agujas dauphine con faceta central
    def dauphine(deg, length, width, tail):
        tip = pt(length, deg)
        base = pt(-tail, deg)
        left = pt(width / 2, deg - 90)
        right = pt(width / 2, deg + 90)
        lx, ly = left
        rx, ry = right
        d.polygon([base, (lx, ly), tip], fill=(255, 241, 208, 255))
        d.polygon([base, (rx, ry), tip], fill=(178, 136, 70, 255))

    # Sombra suave de las agujas
    hshadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hshadow)
    for deg, ln, wd in ((305, Rd * 0.52, Rd * 0.13), (60, Rd * 0.80, Rd * 0.10)):
        tip = pt(ln, deg, C + S * 0.012, C + S * 0.018)
        hd.polygon([pt(-Rd * 0.08, deg, C + S * 0.012, C + S * 0.018), pt(wd / 2, deg - 90, C + S * 0.012, C + S * 0.018), tip, pt(wd / 2, deg + 90, C + S * 0.012, C + S * 0.018)], fill=(0, 0, 0, 170))
    img = Image.alpha_composite(img, hshadow.filter(ImageFilter.GaussianBlur(S * 0.008)))
    d = ImageDraw.Draw(img)

    dauphine(305, Rd * 0.52, Rd * 0.13, Rd * 0.08)
    dauphine(60, Rd * 0.80, Rd * 0.10, Rd * 0.08)

    # Segundero (rojo apagado) con contrapeso
    sec = 200
    p_tip, p_tail = pt(Rd * 0.86, sec), pt(-Rd * 0.22, sec)
    d.line((p_tail, p_tip), fill=(214, 112, 96, 255), width=int(S * 0.008))
    tx, ty = pt(-Rd * 0.17, sec)
    rr = Rd * 0.045
    d.ellipse((tx - rr, ty - rr, tx + rr, ty + rr), fill=(214, 112, 96, 255))

    # Tapa central
    for r, col in ((Rd * 0.06, (230, 200, 140, 255)), (Rd * 0.03, (214, 112, 96, 255)), (Rd * 0.012, (40, 30, 20, 255))):
        d.ellipse((C - r, C - r, C + r, C + r), fill=col)

    # Brillo especular sobre el cristal
    glare = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glare).ellipse((C - Rd * 1.25, C - Rd * 1.55, C + Rd * 0.55, C + Rd * 0.05), fill=(255, 245, 225, 34))
    glare = glare.filter(ImageFilter.GaussianBlur(S * 0.02))
    img = Image.alpha_composite(img, Image.composite(glare, Image.new('RGBA', (S, S), (0, 0, 0, 0)), circle_mask(Rd)))

    return img.convert('RGB')


def main(out_dir, preview_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    full = render(1.0)
    maskable = render(0.82)
    sizes = {'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512, 'favicon-32.png': 32}
    for name, px in sizes.items():
        full.resize((px, px), Image.LANCZOS).save(out / name, optimize=True)
    maskable.resize((512, 512), Image.LANCZOS).save(out / 'icon-maskable-512.png', optimize=True)

    # Vista previa con la máscara redondeada de iOS
    pv = full.resize((1024, 1024), Image.LANCZOS)
    m = Image.new('L', (1024, 1024), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, 1023, 1023), radius=225, fill=255)
    bg = Image.new('RGB', (1024, 1024), (240, 238, 234))
    bg.paste(pv, (0, 0), m)
    bg.save(Path(preview_dir) / 'icon-preview.png')
    print('ok')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

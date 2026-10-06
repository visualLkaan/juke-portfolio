# Renders one PDF page to a PNG at a given pixel width (used by import-projects.mjs).
# usage: python scripts/render_pdf.py <file.pdf> <page> <out.png> <width_px>
import sys
import pymupdf

src, page, out, width = sys.argv[1], int(sys.argv[2]), sys.argv[3], int(sys.argv[4])
doc = pymupdf.open(src)
p = doc[page]
zoom = width / p.rect.width
p.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False).save(out)
print(f"{doc.page_count}")

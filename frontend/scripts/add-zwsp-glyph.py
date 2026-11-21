"""Give a font an invisible, zero-width glyph for U+200B (zero width space).

The PDF export breaks Thai lines between words by putting a zero width space between them
(Thai has no spaces). Sarabun has no glyph for it, so the PDF would show a box there.

    pip install fonttools
    python frontend/scripts/add-zwsp-glyph.py \
      node_modules/@expo-google-fonts/sarabun/400Regular/Sarabun_400Regular.ttf frontend/src/export/fonts/Sarabun-Regular.ttf
    (and 700Bold/Sarabun_700Bold.ttf → Sarabun-Bold.ttf)
"""
import sys

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

src, dst = sys.argv[1], sys.argv[2]
font = TTFont(src)
name = "uni200B"
if name not in font.getGlyphOrder():
    font.setGlyphOrder(font.getGlyphOrder() + [name])
    font["glyf"][name] = TTGlyphPen(None).glyph()  # no outline
    font["hmtx"][name] = (0, 0)  # no width
    font["maxp"].numGlyphs = len(font.getGlyphOrder())
for table in font["cmap"].tables:
    if table.isUnicode():
        table.cmap[0x200B] = name
font.save(dst)

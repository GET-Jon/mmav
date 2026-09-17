from pathlib import Path

path = Path('scripts/ensure-expand-search-source.mjs')
text = path.read_text()
old = """  const editCompsFlow =
    source.includes('Dealer Profile & Preferences →') &&
    source.includes('Edit Comp Markets') &&
    source.includes('Search Selected Markets');"""
new = """  const editCompsFlow =
    source.includes('Dealer Profile & Preferences →') &&
    (source.includes('Edit Comp Markets') || source.includes('Edit Comps')) &&
    source.includes('Search Selected Markets') &&
    source.includes('Vehicle Match');"""
if old not in text:
    raise RuntimeError('editCompsFlow guard block not found')
path.write_text(text.replace(old, new, 1))
print('Updated comp-search guard for tabbed editor')

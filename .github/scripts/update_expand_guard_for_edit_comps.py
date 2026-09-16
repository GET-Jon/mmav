from pathlib import Path

path = Path('scripts/ensure-expand-search-source.mjs')
text = path.read_text()

anchor = '''  if (source.includes(strongCompGate) || source.includes(correctedGate)) {
    return source;
  }
'''
replacement = '''  const editCompsFlow =
    source.includes('Dealer Profile & Preferences →') &&
    source.includes('Edit Comp Markets') &&
    source.includes('Search Selected Markets');

  if (editCompsFlow || source.includes(strongCompGate) || source.includes(correctedGate)) {
    return source;
  }
'''

if anchor not in text:
    raise RuntimeError('Could not locate comp search safety guard return block')

path.write_text(text.replace(anchor, replacement))
print('Updated comp-search safety guard for Edit Comps flow')

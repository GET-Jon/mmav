from pathlib import Path

path = Path('components/evaluation/evaluation-workspace.tsx')
text = path.read_text()
old = '''      .sort((a, b) => a.order - b.order)
      .map((market) => ({ market: market.market, zip: market.zip }));
'''
new = '''      .sort((a, b) => a.order - b.order);
'''
if old not in text:
    raise RuntimeError('Could not locate selected-market region mapping')
path.write_text(text.replace(old, new))
print('Kept full regional-market records for comp search')

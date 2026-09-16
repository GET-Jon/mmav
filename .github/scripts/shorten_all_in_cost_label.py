from pathlib import Path
path = Path('components/evaluation/evaluation-workspace.tsx')
text = path.read_text()
old = '                    Estimated All-In Cost\n'
new = '                    All-In Cost\n'
if old not in text:
    raise RuntimeError('Could not find Estimated All-In Cost label')
path.write_text(text.replace(old, new, 1))
print('Shortened verdict cost label')

// Extract only explicit text, without a vehicle knowledge lookup.
function extract(text) {
  const displacement = text.match(/\b(\d+(?:\.\d+)?)\s*(?:L|litres?|liters?)\b/i);
  const cylinders = text.match(/\b(?:V|I|L|H|W)\s*(\d{1,2})\b/i) || text.match(/\b(\d{1,2})[-\s]*(?:cyl|cylinder)s?\b/i);
  const automatic = /\b(automatic|auto|automated manual|dual[- ]clutch|dct|cvt)\b/i.test(text);
  const manual = /\bmanual\b/i.test(text);
  return { displacement: displacement ? Number(displacement[1]) : null,
    cylinders: cylinders ? Number(cylinders[1]) : null,
    transmission: automatic ? 'automatic' : manual ? 'manual' : null };
}
module.exports = { extract };

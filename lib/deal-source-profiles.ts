export type DealSourceProfile = {
  id: string;
  name: string;
  auctionFee: number;
  transport: number;
  recon: number;
  detailAdmin: number;
  generalRiskReserve: number;
};

export const defaultDealSources: DealSourceProfile[] = [
  { id: "auction-local", name: "Auction — Local", auctionFee: 700, transport: 250, recon: 0, detailAdmin: 350, generalRiskReserve: 500 },
  { id: "auction-out", name: "Auction — Out of State", auctionFee: 700, transport: 900, recon: 0, detailAdmin: 350, generalRiskReserve: 500 },
  { id: "private-local", name: "Private Sale — Local", auctionFee: 0, transport: 100, recon: 0, detailAdmin: 350, generalRiskReserve: 500 },
  { id: "private-out", name: "Private Sale — Out of State", auctionFee: 0, transport: 900, recon: 0, detailAdmin: 350, generalRiskReserve: 500 },
  { id: "facebook", name: "Facebook", auctionFee: 0, transport: 100, recon: 0, detailAdmin: 350, generalRiskReserve: 500 },
];

const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1_000_000, value)) : 0;

export function normalizeDealSources(raw: unknown): DealSourceProfile[] {
  if (!Array.isArray(raw)) return defaultDealSources.map(row => ({...row}));
  const ids = new Set<string>();
  const names = new Set<string>();
  const result: DealSourceProfile[] = [];
  for (const row of raw.slice(0, 30)) {
    if (!row || typeof row !== "object") continue;
    const id = String(row.id || "").trim().slice(0, 80);
    const name = String(row.name || "").trim().slice(0, 90);
    if (!id || !name || ids.has(id) || names.has(name.toLowerCase())) continue;
    ids.add(id); names.add(name.toLowerCase());
    result.push({ id, name, auctionFee: amount(row.auctionFee), transport: amount(row.transport),
      recon: amount(row.recon), detailAdmin: amount(row.detailAdmin), generalRiskReserve: amount(row.generalRiskReserve) });
  }
  return result;
}

export function dealSourceForValue(profiles: DealSourceProfile[], value: string) {
  return profiles.find(profile => profile.id === value || profile.name === value);
}

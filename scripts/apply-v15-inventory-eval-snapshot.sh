#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

python - <<'PY'
from pathlib import Path

path = Path("components/mindful-inventory/inventory-overview-intake.tsx")
text = path.read_text()

def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH STOPPED: expected exactly 1 occurrence for {label}, found {count}")
    text = text.replace(old, new, 1)

replace_once(
'''  const fullEvaluation = (snapshot.lotLogicEvaluationSnapshot && typeof snapshot.lotLogicEvaluationSnapshot === "object")
    ? snapshot.lotLogicEvaluationSnapshot as Record<string, unknown>
    : null;
  const conditionAnalysis =''',
'''  const fullEvaluation = (snapshot.lotLogicEvaluationSnapshot && typeof snapshot.lotLogicEvaluationSnapshot === "object")
    ? snapshot.lotLogicEvaluationSnapshot as Record<string, unknown>
    : null;
  const evaluationPayload = (fullEvaluation?.payload && typeof fullEvaluation.payload === "object")
    ? fullEvaluation.payload as Record<string, unknown>
    : null;
  const decodedVehicle = (evaluationPayload?.decodedVehicle && typeof evaluationPayload.decodedVehicle === "object")
    ? evaluationPayload.decodedVehicle as Record<string, unknown>
    : (fullEvaluation?.decodedVehicle && typeof fullEvaluation.decodedVehicle === "object")
      ? fullEvaluation.decodedVehicle as Record<string, unknown>
      : null;
  const manualVehicle = (evaluationPayload?.manualVehicle && typeof evaluationPayload.manualVehicle === "object")
    ? evaluationPayload.manualVehicle as Record<string, unknown>
    : null;
  const valuationSnapshot = (evaluationPayload?.valuation && typeof evaluationPayload.valuation === "object")
    ? evaluationPayload.valuation as Record<string, unknown>
    : null;
  const decodedEngine = [
    textValue(decodedVehicle?.displacementL) ? `${textValue(decodedVehicle?.displacementL)}L` : null,
    textValue(decodedVehicle?.engineCylinders) ? `${textValue(decodedVehicle?.engineCylinders)}-cyl` : null,
  ].filter(Boolean).join(" ") || null;
  const conditionAnalysis =''',
"nested evaluation payload extraction",
)

replace_once(
'''  const originalRecon = numberValue(snapshot.conditionPlanningEstimateOverride)
    ?? numberValue(fullEvaluation?.expected_reconditioning_cost)
    ?? numberValue(fullEvaluation?.reconditioning_cost)
    ?? numberValue(conditionAnalysis?.planningEstimate);
  const originalGross = numberValue(snapshot.expectedGrossProfit) ?? numberValue(fullEvaluation?.expected_gross_profit);
  const originalTarget = numberValue(snapshot.targetResaleUsed) ?? vehicle.expectedSalePrice;''',
'''  const originalRecon = numberValue(snapshot.conditionPlanningEstimateOverride)
    ?? numberValue(evaluationPayload?.conditionPlanningEstimateOverride)
    ?? numberValue(fullEvaluation?.expected_reconditioning_cost)
    ?? numberValue(fullEvaluation?.reconditioning_cost)
    ?? numberValue(conditionAnalysis?.planningEstimate);
  const originalGross = numberValue(snapshot.expectedGrossProfit)
    ?? numberValue(valuationSnapshot?.expectedGrossProfit)
    ?? numberValue(fullEvaluation?.expected_gross_profit);
  const originalTarget = numberValue(snapshot.targetResaleUsed)
    ?? numberValue(evaluationPayload?.finalTargetUsed)
    ?? numberValue(evaluationPayload?.targetResaleFromComps)
    ?? vehicle.expectedSalePrice;''',
"evaluation financial payload extraction",
)

replace_once(
'''  const lotLogicBidDetails = useMemo<Array<[string, React.ReactNode]>>(() => [
    ["Source", textValue(snapshot.auctionSite) || textValue(fullEvaluation?.auction_site)],
    ["Auction / Listing", textValue(snapshot.auctionUrl) || textValue(fullEvaluation?.auction_url)],
    ["Decision", textValue(snapshot.decision) || textValue(fullEvaluation?.decision)],
    ["Risk Grade", textValue(snapshot.riskGrade) || textValue(fullEvaluation?.risk_grade)],
    ["Safe Bid", money(numberValue(snapshot.safeBid) ?? numberValue(fullEvaluation?.safe_bid))],
    ["Max Smart Bid", money(numberValue(snapshot.maxSmartBid) ?? numberValue(fullEvaluation?.max_smart_bid))],
    ["Stretch Bid", money(numberValue(snapshot.stretchBid) ?? numberValue(fullEvaluation?.stretch_bid))],
    ["Purchase Price", money(vehicle.purchasePrice)],
    ["Lot Logic Recon", money(originalRecon)],
    ["Expected Sale", money(originalTarget)],
    ["Expected Gross", money(originalGross)],
  ], [snapshot, fullEvaluation, vehicle.purchasePrice, originalRecon, originalTarget, originalGross]);''',
'''  const lotLogicBidDetails = useMemo<Array<[string, React.ReactNode]>>(() => [
    ["Source", textValue(snapshot.auctionSite) || textValue(evaluationPayload?.auctionSite) || textValue(fullEvaluation?.auction_site)],
    ["Auction / Listing", textValue(snapshot.auctionUrl) || textValue(evaluationPayload?.auctionUrl) || textValue(fullEvaluation?.auction_url)],
    ["Decision", textValue(snapshot.decision) || textValue(valuationSnapshot?.decision) || textValue(fullEvaluation?.decision)],
    ["Risk Grade", textValue(snapshot.riskGrade) || textValue(valuationSnapshot?.riskGrade) || textValue(fullEvaluation?.risk_grade)],
    ["Safe Bid", money(numberValue(snapshot.safeBid) ?? numberValue(valuationSnapshot?.safeBid) ?? numberValue(fullEvaluation?.safe_bid))],
    ["Max Smart Bid", money(numberValue(snapshot.maxSmartBid) ?? numberValue(valuationSnapshot?.maxSmartBid) ?? numberValue(fullEvaluation?.max_smart_bid))],
    ["Stretch Bid", money(numberValue(snapshot.stretchBid) ?? numberValue(valuationSnapshot?.stretchBid) ?? numberValue(fullEvaluation?.stretch_bid))],
    ["Purchase Price", money(vehicle.purchasePrice)],
    ["Lot Logic Recon", money(originalRecon)],
    ["Expected Sale", money(originalTarget)],
    ["Expected Gross", money(originalGross)],
  ], [snapshot, evaluationPayload, valuationSnapshot, fullEvaluation, vehicle.purchasePrice, originalRecon, originalTarget, originalGross]);''',
"bid details nested payload",
)

replace_once(
'''  const lotLogicVehicleDetails = useMemo<Array<[string, React.ReactNode]>>(() => [
    ["VIN", vehicle.vin || textValue(snapshot.vin) || textValue(fullEvaluation?.vin)],
    ["Year", vehicle.year || numberValue(snapshot.year) || numberValue(fullEvaluation?.year)],
    ["Make", vehicle.make || textValue(snapshot.make) || textValue(fullEvaluation?.make)],
    ["Model", vehicle.model || textValue(snapshot.model) || textValue(fullEvaluation?.model)],
    ["Trim", vehicle.trim || textValue(snapshot.trim) || textValue(fullEvaluation?.trim)],
    ["Mileage", vehicle.mileage === null ? "—" : vehicle.mileage.toLocaleString()],
    ["Body Style", textValue(snapshot.bodyStyle) || textValue(snapshot.body_style) || textValue(fullEvaluation?.body_style)],
    ["Engine", textValue(snapshot.engine) || textValue(snapshot.engineDescription) || textValue(fullEvaluation?.engine)],
    ["Transmission", textValue(snapshot.transmission) || textValue(fullEvaluation?.transmission)],
    ["Drivetrain", textValue(snapshot.drivetrain) || textValue(snapshot.driveType) || textValue(fullEvaluation?.drivetrain)],
    ["Fuel Type", textValue(snapshot.fuelType) || textValue(snapshot.fuel_type) || textValue(fullEvaluation?.fuel_type)],
    ["Exterior Color", textValue(snapshot.exteriorColor) || textValue(snapshot.exterior_color) || textValue(fullEvaluation?.exterior_color)],
    ["Interior Color", textValue(snapshot.interiorColor) || textValue(snapshot.interior_color) || textValue(fullEvaluation?.interior_color)],
  ], [snapshot, fullEvaluation, vehicle]);''',
'''  const lotLogicVehicleDetails = useMemo<Array<[string, React.ReactNode]>>(() => [
    ["VIN", vehicle.vin || textValue(snapshot.vin) || textValue(evaluationPayload?.vin) || textValue(decodedVehicle?.vin) || textValue(fullEvaluation?.vin)],
    ["Year", vehicle.year || numberValue(snapshot.year) || numberValue(decodedVehicle?.year) || numberValue(manualVehicle?.year) || numberValue(fullEvaluation?.year)],
    ["Make", vehicle.make || textValue(snapshot.make) || textValue(decodedVehicle?.make) || textValue(manualVehicle?.make) || textValue(fullEvaluation?.make)],
    ["Model", vehicle.model || textValue(snapshot.model) || textValue(decodedVehicle?.model) || textValue(manualVehicle?.model) || textValue(fullEvaluation?.model)],
    ["Trim", vehicle.trim || textValue(snapshot.trim) || textValue(decodedVehicle?.trim) || textValue(manualVehicle?.trim) || textValue(fullEvaluation?.trim)],
    ["Mileage", vehicle.mileage !== null
      ? vehicle.mileage.toLocaleString()
      : numberValue(evaluationPayload?.targetMileage)?.toLocaleString() || "—"],
    ["Body Style", textValue(snapshot.bodyStyle) || textValue(snapshot.body_style) || textValue(decodedVehicle?.bodyClass) || textValue(manualVehicle?.bodyClass) || textValue(fullEvaluation?.body_style)],
    ["Engine", textValue(snapshot.engine) || textValue(snapshot.engineDescription) || decodedEngine || textValue(fullEvaluation?.engine)],
    ["Transmission", textValue(snapshot.transmission) || textValue(evaluationPayload?.transmission) || textValue(fullEvaluation?.transmission)],
    ["Drivetrain", textValue(snapshot.drivetrain) || textValue(snapshot.driveType) || textValue(decodedVehicle?.driveType) || textValue(fullEvaluation?.drivetrain)],
    ["Fuel Type", textValue(snapshot.fuelType) || textValue(snapshot.fuel_type) || textValue(decodedVehicle?.fuelType) || textValue(fullEvaluation?.fuel_type)],
    ["Exterior Color", textValue(snapshot.exteriorColor) || textValue(snapshot.exterior_color) || textValue(evaluationPayload?.exteriorColor) || textValue(fullEvaluation?.exterior_color)],
    ["Interior Color", textValue(snapshot.interiorColor) || textValue(snapshot.interior_color) || textValue(evaluationPayload?.interiorColor) || textValue(fullEvaluation?.interior_color)],
  ], [snapshot, evaluationPayload, decodedVehicle, manualVehicle, decodedEngine, fullEvaluation, vehicle]);''',
"vehicle details nested payload",
)

path.write_text(text)
print("✓ Inventory now reads nested Lot Logic evaluation payload")
print("✓ VIN-decoded body style, engine, drivetrain and fuel type are surfaced")
print("✓ Bid / deal fields now read valuation data from the preserved payload")
PY

git diff --check
rm -f scripts/apply-v15-inventory-eval-snapshot.sh

git add components/mindful-inventory/inventory-overview-intake.tsx scripts/apply-v15-inventory-eval-snapshot.sh
git commit -m "Read preserved evaluation details in inventory"
git push origin v15-inventory-workflow

echo "✓ V15 inventory evaluation snapshot fix committed and pushed"

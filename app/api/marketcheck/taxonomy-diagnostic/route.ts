import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const apiKey = process.env.MARKETCHECK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing MARKETCHECK_API_KEY" }, { status: 500 });
  }

  const url = new URL(request.url);
  const make = url.searchParams.get("make") || "Audi";
  const year = url.searchParams.get("year") || "2012";
  const model = url.searchParams.get("model");

  const params = new URLSearchParams({
    api_key: apiKey,
    make,
    year,
    field: "model|0|1000,trim|0|1000",
  });

  if (model) params.set("model", model);

  const response = await fetch(
    `https://api.marketcheck.com/v2/specs/car/terms?${params.toString()}`,
    { cache: "no-store" },
  );

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  return NextResponse.json({
    status: response.status,
    make,
    year,
    model,
    payload,
  });
}

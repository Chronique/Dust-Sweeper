import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const apiKey = process.env.NEXT_PUBLIC_ZEROEX_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Missing 0x API Key" }, { status: 500 });
  }

  // Forward query params dari frontend ke 0x API
  const queryString = searchParams.toString();
  const url = `https://base.api.0x.org/swap/v1/quote?${queryString}`;

  try {
    const res = await fetch(url, {
      headers: {
        "0x-api-key": apiKey,
      },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch 0x quote" }, { status: 500 });
  }
}
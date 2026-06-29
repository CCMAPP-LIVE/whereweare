import { ImageResponse } from "next/og";
import { BrandMark } from "@/lib/brand";

export async function GET(
  _request: Request,
  context: { params: Promise<{ size: string }> },
) {
  const { size } = await context.params;
  const n = Math.min(1024, Math.max(48, parseInt(size, 10) || 192));
  return new ImageResponse(BrandMark(n), { width: n, height: n });
}

import { NextResponse } from "next/server";

const responseHeaders = (headers?: HeadersInit) => {
  const result = new Headers(headers);
  if (!result.has("Cache-Control")) result.set("Cache-Control", "no-store");
  return result;
};

export const errorResponse = (
  error: string,
  status = 400,
  code = "ERROR",
  headers?: HeadersInit,
) =>
  NextResponse.json(
    {
      ok: false,
      error,
      code,
    },
    {
      status,
      headers: responseHeaders(headers),
    },
  );

export const successResponse = (
  data: Record<string, unknown> = {},
  message = "操作成功",
  status = 200,
  headers?: HeadersInit,
) =>
  NextResponse.json(
    {
      ok: true,
      message,
      ...data,
    },
    {
      status,
      headers: responseHeaders(headers),
    },
  );

import { NextResponse } from "next/server";

export const errorResponse = (
  error: string,
  status = 400,
  code = "ERROR",
  headers?: HeadersInit
) =>
  NextResponse.json(
    {
      ok: false,
      error,
      code,
    },
    {
      status,
      ...(headers ? { headers } : {}),
    }
  );

export const successResponse = (
  data: Record<string, unknown> = {},
  message = "操作成功",
  status = 200,
  headers?: HeadersInit
) =>
  NextResponse.json(
    {
      ok: true,
      message,
      ...data,
    },
    {
      status,
      ...(headers ? { headers } : {}),
    }
  );

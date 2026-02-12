import { NextResponse } from "next/server";

const logoutResponse = () =>
  new NextResponse("Logged out", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
  });

export async function GET() {
  return logoutResponse();
}

export async function POST() {
  return logoutResponse();
}

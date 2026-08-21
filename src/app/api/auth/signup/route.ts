import { NextRequest, NextResponse } from "next/server";
import { signToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.email || !body?.password || !body?.name) {
      return NextResponse.json({ error: "Email, password, and name are required" }, { status: 400 });
    }

    // TODO: Validate against stored credentials in production
    const userId = crypto.randomUUID();
    
    const token = signToken({
      userId,
      email: body.email,
      role: "child",
    });

    const response = NextResponse.json({ ok: true, userId }, {
      headers: {
        "x-user-id": userId,
      },
    });

    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    console.error("Sign up failed:", error);
    return NextResponse.json({ error: "Failed to sign up" }, { status: 500 });
  }
}

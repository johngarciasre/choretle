import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  if (!body?.email || !body?.password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) {
            const { name, value, options } = cookie;
            let cookieStr = `${name}=${value}`;
            if (options) {
              for (const [key, val] of Object.entries(options)) {
                cookieStr += `; ${key}=${val}`;
              }
            }
            NextResponse.headers.append("set-cookie", cookieStr);
          }
        },
      }
    }
  );

  const signInResult = await supabase.auth.signInWithPassword({
    email: body.email.toLowerCase().trim(),
    password: body.password,
  });

  if (signInResult.error) {
    return NextResponse.json(
      { error: signInResult.error.message || "Failed to sign in" },
      { status: 401 }
    );
  }

  const session = signInResult.data.session;
  if (!session) {
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }

  const response = NextResponse.json(
    { 
      ok: true, 
      userId: session.user.id,
      email: session.user.email,
      role: session.user.user_metadata?.role || "child",
      message: "Sign in successful"
    },
    { status: 200 }
  );

  const cookieName = `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL!.split("//")[1].split(".")[0]}${process.env.NODE_ENV === 'production' ? '-auth' : ''}-token`;
  response.headers.append(
    "set-cookie",
    `${cookieName}=${encodeURIComponent(JSON.stringify({
      access_token: session.access_token,
      token_type: "bearer",
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      refresh_token: session.refresh_token,
      user: {
        id: session.user.id,
        aud: session.user.aud,
        email: session.user.email,
        phone: session.user.phone,
        app_metadata: session.user.app_metadata,
        user_metadata: session.user.user_metadata,
        identities: session.user.identities,
      }
    }))}; Path=/; Secure; HttpOnly; SameSite=Lax`
  );

  return response;
}

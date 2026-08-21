import { randomBytes, createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.JWT_SECRET || randomBytes(32).toString("hex");
const TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role?: string;
  familyId?: string;
  iat: number;
  exp: number;
}

export function signToken(payload: Omit<AuthTokenPayload, "iat" | "exp">): string {
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload: AuthTokenPayload = { ...payload, iat: now, exp: now + TOKEN_EXPIRY };
  
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64url");
  
  const body = Buffer.from(
    JSON.stringify(tokenPayload)
  ).toString("base64url");
  
  const signature = createHmac("sha256", SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const [header, body, signature] = parts;
    const expectedSignature = createHmac("sha256", SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");
    
    if (!timingSafeEqual(
      Buffer.from(signature, "base64url"),
      Buffer.from(expectedSignature, "base64url")
    )) {
      return null;
    }
    
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    
    return payload as AuthTokenPayload;
  } catch {
    return null;
  }
}

export function getTokenFromCookie(cookieHeader: string | null): AuthTokenPayload | null {
  if (!cookieHeader) return null;
  
  const token = cookieHeader.replace("Bearer ", "");
  return verifyToken(token);
}

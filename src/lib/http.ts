import { NextResponse } from "next/server";

/** Authenticated responses must never be cached by a browser or a proxy. */
export function noCache<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

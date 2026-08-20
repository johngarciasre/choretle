export async function createFamily(name: string, weekStartDay = 0) {
  return { id: crypto.randomUUID(), name }; // Stub — replace with real DB when Supabase is configured
}

export async function joinFamily(code: string) {
  return { id: crypto.randomUUID(), name: "Family" }; // Stub
}

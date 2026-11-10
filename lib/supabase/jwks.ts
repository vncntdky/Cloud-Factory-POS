// Supabase's public key for checking login tokens (ES256), copied from
// https://pyjhwbfdxrjeitwjztna.supabase.co/auth/v1/.well-known/jwks.json. It is public by design.
// Passing it to getClaims saves a fetch of that file on most requests, which was costing
// 0.3–1.2 s per page. If Supabase rotates the key, getClaims finds no match here and fetches the
// current set itself, so a stale copy only costs speed, never correctness.
import type { JWK } from "@supabase/auth-js";

export const SUPABASE_JWKS: { keys: JWK[] } = {
  keys: [
    {
      alg: "ES256",
      crv: "P-256",
      ext: true,
      key_ops: ["verify"],
      kid: "7c8606bf-236b-42c9-8c43-dc399f758bf5",
      kty: "EC",
      use: "sig",
      x: "Kv6a0rmaSKN6E4Z5ghmoY0V00hCzey_yDcV6ViWpNZU",
      y: "yU2IfR6TeptIWOpA2_XurmjdzrUqmw5SOU87qZ5hIUI",
    },
  ],
};

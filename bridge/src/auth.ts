const AUTH_TOKEN = process.env.PI_REMOTE_TOKEN ?? "pi-remote-default-token";

export function authenticate(req: { headers: { authorization?: string } }): boolean {
  const auth = req.headers.authorization ?? "";
  const [, token] = auth.split(" ");
  return token === AUTH_TOKEN;
}

export function getAuthError(): { type: string; message: string } {
  return { type: "error", message: "Unauthorized. Provide Bearer token in Authorization header." };
}

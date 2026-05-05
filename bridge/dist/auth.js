const AUTH_TOKEN = process.env.PI_REMOTE_TOKEN ?? "pi-remote-default-token";
export function authenticate(req) {
    const auth = req.headers.authorization ?? "";
    const [, token] = auth.split(" ");
    return token === AUTH_TOKEN;
}
export function getAuthError() {
    return { type: "error", message: "Unauthorized. Provide Bearer token in Authorization header." };
}

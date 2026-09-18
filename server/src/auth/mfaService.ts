// Pinned to otplib@12 for its simple, stable `authenticator` API — v13 replaced it with a
// plugin/crypto-provider based rewrite that adds complexity this project doesn't need.
import { authenticator } from "otplib";
import QRCode from "qrcode";

const ISSUER = "Cayman Trade Order System";

authenticator.options = { window: 1 }; // tolerate 1 step (±30s) of clock drift

export function generateSecret(): string {
  return authenticator.generateSecret();
}

export function keyUri(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

export async function qrCodeDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri);
}

export function verifyToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

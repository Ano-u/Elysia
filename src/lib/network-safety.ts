const privateHostPatterns = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/i,
  /^fc/i,
  /^fd/i,
];

function isPrivateIpv4(hostname: string): boolean {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return false;
  }
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }
  return privateHostPatterns.some((rule) => rule.test(hostname));
}

export function validatePublicHttpsUrl(raw: string): { ok: true; url: URL } | { ok: false; message: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, message: "URL 格式无效" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, message: "仅允许 https 地址" };
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname) {
    return { ok: false, message: "缺少主机名" };
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return { ok: false, message: "禁止内网域名" };
  }
  if (hostname.includes("..")) {
    return { ok: false, message: "域名格式无效" };
  }
  if (hostname.includes(":")) {
    return { ok: false, message: "禁止使用 IPv6 主机地址" };
  }
  if (isPrivateIpv4(hostname)) {
    return { ok: false, message: "禁止使用内网或本机地址" };
  }

  return { ok: true, url: parsed };
}

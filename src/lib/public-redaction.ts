export const PUBLIC_URL_OR_DOMAIN_PATTERN =
  /(https?:\/\/|www\.|(?:[a-z0-9-]+\.)+(?:com|cn|net|top|vip|xyz|cc|io|me|co|shop|store)\b)/i;

export const PUBLIC_AD_OR_SPAM_PATTERN =
  /(加我|私聊|推广|引流|返利|优惠|招代理|兼职|电报群|tg群|vx|vx|v信|微\s*信|wechat|q群|qq群|企鹅群|扫码|下单|客服|代理价|拼单)/i;

export const PUBLIC_PHONE_REDACTION_PATTERN = /(?:\+?86[-\s]?)?1[3-9]\d{9}/g;
export const PUBLIC_EMAIL_REDACTION_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
export const PUBLIC_URL_REDACTION_PATTERN =
  /https?:\/\/\S+|www\.[^\s]+|(?:[a-z0-9-]+\.)+(?:com|cn|net|top|vip|xyz|cc|io|me|co|shop|store)\b/gi;
export const PUBLIC_TIME_REDACTION_PATTERN =
  /(?:(?:19|20)\d{2}[年\/-]\d{1,2}(?:[月\/-]\d{1,2}[日号]?)?|\d{1,2}[月\/-]\d{1,2}[日号]?|(?:上|下)?午?\s*\d{1,2}(?::\d{1,2}|[:点时]\d{0,2})?)/g;
export const PUBLIC_ADDRESS_REDACTION_PATTERN =
  /((?:[\u4e00-\u9fa5]{2,}(?:省|市|自治区|特别行政区))?(?:[\u4e00-\u9fa5]{2,}(?:市|区|县|镇|乡|街道|村))[^，。；\n]{0,18}(?:路|街|巷|弄|道|号|栋|幢|单元|室))/g;

export type PublicLocationSummary = {
  country: string | null;
  region: string | null;
  city: string | null;
  label: string | null;
  precision: "country" | "region" | "city";
};

export function redactPublicText(text: string | null): string | null {
  if (!text) {
    return text;
  }

  return text
    .replace(PUBLIC_PHONE_REDACTION_PATTERN, "[已隐藏联系方式]")
    .replace(PUBLIC_EMAIL_REDACTION_PATTERN, "[已隐藏邮箱]")
    .replace(PUBLIC_URL_REDACTION_PATTERN, "[已隐藏链接]")
    .replace(PUBLIC_TIME_REDACTION_PATTERN, "[已模糊时间]")
    .replace(PUBLIC_ADDRESS_REDACTION_PATTERN, "[已模糊地址]");
}

export function redactOccurredAtToMonth(occurredAt: string | null): string | null {
  if (!occurredAt) {
    return occurredAt;
  }

  const value = new Date(occurredAt);
  if (Number.isNaN(value.getTime())) {
    return occurredAt.slice(0, 7);
  }

  return value.toISOString().slice(0, 7);
}

export function buildPublicLocationSummary(input: {
  country?: string | null;
  region?: string | null;
  city?: string | null;
}): PublicLocationSummary | null {
  const city = input.city?.trim() || null;
  const region = input.region?.trim() || null;
  const country = input.country?.trim() || null;

  if (city) {
    return {
      country,
      region,
      city,
      label: city,
      precision: "city",
    };
  }

  if (region) {
    return {
      country,
      region,
      city: null,
      label: region,
      precision: "region",
    };
  }

  if (country) {
    return {
      country,
      region: null,
      city: null,
      label: country,
      precision: "country",
    };
  }

  return null;
}

export function hasPublicAdOrUrlRisk(text: string): { matched: boolean; labels: string[] } {
  const labels: string[] = [];
  if (PUBLIC_URL_OR_DOMAIN_PATTERN.test(text)) {
    labels.push("url_or_domain");
  }
  if (PUBLIC_AD_OR_SPAM_PATTERN.test(text)) {
    labels.push("ad_or_spam");
  }

  return {
    matched: labels.length > 0,
    labels,
  };
}

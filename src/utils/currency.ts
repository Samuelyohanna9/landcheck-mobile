export const normalizeCurrencyCode = (value?: string | null, fallback = "NGN") => {
  const lettersOnly = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
  return lettersOnly.length === 3 ? lettersOnly : fallback;
};

export const formatCurrencyAmount = (amount?: number | null, currency?: string | null, fallback = "NGN") => {
  const safeAmount = Number(amount || 0);
  const safeCurrency = normalizeCurrencyCode(currency, fallback);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: 0,
    }).format(safeAmount);
  } catch {
    return `${safeCurrency} ${safeAmount.toLocaleString()}`;
  }
};

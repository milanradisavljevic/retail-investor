function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes('your_publishable_key') ||
    normalized.includes('your_secret_key') ||
    normalized.includes('placeholder') ||
    normalized.includes('example') ||
    normalized.includes('zxhhbxbs')
  );
}

export function isClerkConfiguredServer(): boolean {
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secret = process.env.CLERK_SECRET_KEY;
  return !isPlaceholder(publishable) && !isPlaceholder(secret);
}

export function isAuthBypassEnabledServer(): boolean {
  if (process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true') return true;
  if (process.env.NODE_ENV === 'production') return false;
  return !isClerkConfiguredServer();
}

export function isClerkConfiguredClient(): boolean {
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return !isPlaceholder(publishable);
}

export function isAuthBypassEnabledClient(): boolean {
  if (process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true') return true;
  if (process.env.NODE_ENV === 'production') return false;
  return !isClerkConfiguredClient();
}

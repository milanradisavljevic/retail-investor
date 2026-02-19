import { auth } from '@clerk/nextjs/server';
import { isAuthBypassEnabledServer } from '@/lib/authMode';

export async function getAuthUserId(): Promise<string> {
  if (isAuthBypassEnabledServer()) {
    return 'dev-local-user';
  }

  const { userId } = await auth();
  if (!userId) {
    throw new Error('Unauthorized: No user session');
  }
  return userId;
}

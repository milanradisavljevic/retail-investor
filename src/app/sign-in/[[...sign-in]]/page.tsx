import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { isAuthBypassEnabledServer } from '@/lib/authMode';

export default function SignInPage() {
  if (isAuthBypassEnabledServer()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-100">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center max-w-lg">
          <p className="text-sm text-gray-300">
            Auth ist lokal im Dev-Bypass-Modus aktiv (fehlende oder Platzhalter-Clerk-Keys).
          </p>
          <Link href="/" className="inline-block mt-4 text-sm text-blue-400 hover:text-blue-300">
            Zum Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <SignIn />
    </div>
  );
}

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-text-primary mb-2">
          Symbol Not Found
        </h1>
        <p className="text-text-secondary mb-6">
          This symbol is not in the current universe or no data is available.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-accent-blue text-white rounded-lg hover:bg-accent-blue/90 transition-colors"
        >
          ← Back to Latest Briefing
        </Link>
      </div>
    </div>
  );
}

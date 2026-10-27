import Link from "next/link";

export default function ResultPage() {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <h1 className="text-2xl font-bold">Results</h1>
      <p className="mt-2 text-sm text-gray-500">
        Results live on the dashboard after a test, and in History (IndexedDB, this browser only). Shareable results use the link generated from a completed test — see the dashboard&apos;s &quot;Generate share link&quot; button. There is no server-side result database in this deployment.
      </p>
      <Link href="/" className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-white">Go to dashboard</Link>
    </section>
  );
}

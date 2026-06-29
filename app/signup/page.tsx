import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-xl">
          📍
        </div>
        <h1 className="text-xl font-semibold">{APP_NAME} is invite-only</h1>
        <p className="mt-2 text-sm text-neutral-500">
          New accounts can only be created from an invite link. Ask an existing
          member to send you one.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Go to sign in
        </Link>
      </div>
    </main>
  );
}

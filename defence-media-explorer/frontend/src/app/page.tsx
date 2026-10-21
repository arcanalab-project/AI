import Link from "next/link";
import { cookies } from "next/headers";
import { SearchView } from "@/components/search-view";

const DESCRIPTION =
  "BASTION MEDEX (Media Exploitation): semantic search across video, audio and documents, built for restricted environments. Media library, processing pipeline and collections. Built by Mario Noioso.";

export default async function Page() {
  const jar = await cookies();
  if (jar.get("dme_session")?.value) return <SearchView />;

  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <p className="page-kicker">MEDEX</p>
      <h1 className="page-title">BASTION</h1>
      <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted)]">{DESCRIPTION}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/login" className="btn btn-primary">
          Sign in
        </Link>
        <a href="https://marionoioso.com/profile/" rel="author" className="btn btn-quiet">
          About the author
        </a>
      </div>
      <p className="text-sm text-[var(--muted)]">
        <a href="https://marionoioso.com/" rel="author">
          Built by Mario Noioso · marionoioso.com
        </a>
      </p>
    </article>
  );
}

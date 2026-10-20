// Shown instead of a page the signed-in role can't use. The database refuses the data anyway;
// this just explains it instead of showing an empty page.
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Main } from "@/components/Main";
import { Topbar } from "@/components/Topbar";

export function NotAllowed({ title, what, who = "owners and managers" }: { title: string; what: string; who?: string }) {
  return (
    <>
      <Topbar title={title} />
      <Main>
        <EmptyState
          title={`${what} is for ${who}.`}
          text="Ask the owner if you need access."
          action={
            <Link className="btn btn--secondary" href="/">
              Back to Sell
            </Link>
          }
        />
      </Main>
    </>
  );
}

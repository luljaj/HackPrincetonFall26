import Link from "next/link";
import { SAMPLE_SESSION_ID } from "../../lib/parent/sample-id";

export default function ParentHome() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Parent dashboard</h1>
      <p className="text-foreground/70">Open a session to see what your child answered.</p>
      <ul className="space-y-1">
        <li>
          <Link className="underline" href="/parent/live">
            Live session
          </Link>
        </li>
        <li>
          <Link className="underline" href={`/parent/${SAMPLE_SESSION_ID}`}>
            View sample session
          </Link>
        </li>
      </ul>
    </div>
  );
}

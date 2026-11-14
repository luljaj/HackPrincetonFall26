export function LoadingState() {
  return (
    <div aria-busy="true" className="space-y-3">
      <div className="h-6 w-1/3 animate-pulse rounded bg-foreground/10" />
      <div className="h-24 animate-pulse rounded bg-foreground/10" />
      <div className="h-24 animate-pulse rounded bg-foreground/10" />
    </div>
  );
}

export function EmptyState() {
  return <p className="text-foreground/70">Waiting for the first answer…</p>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p role="status" className="rounded border border-foreground/20 p-3 text-sm">
      {message} We'll keep trying.
    </p>
  );
}

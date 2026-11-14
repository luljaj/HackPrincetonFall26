export function SessionHeader({
  objective,
  isSample,
}: {
  objective: string;
  isSample: boolean;
}) {
  return (
    <header className="space-y-1">
      {isSample && (
        <span className="inline-block rounded border border-foreground/30 px-2 py-0.5 text-xs uppercase tracking-wide">
          Sample data
        </span>
      )}
      <p className="text-sm text-foreground/70">Learning goal</p>
      <h1 className="text-2xl font-semibold">{objective}</h1>
    </header>
  );
}

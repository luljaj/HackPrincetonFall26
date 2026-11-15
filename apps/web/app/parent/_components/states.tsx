import { Alert, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { QuestionsIcon } from "./tv-icons";

export function LoadingState() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
}

/** One icon and one short sentence on the big soft panel: the empty-state recipe from the design. */
export function EmptyState({ children = "Waiting for the first answer…" }: { children?: React.ReactNode }) {
  return (
    <Empty className="min-h-[220px] flex-none gap-[21px] p-10 md:p-10">
      <EmptyHeader>
        <EmptyMedia className="mb-0">
          <QuestionsIcon size={32} />
        </EmptyMedia>
        <EmptyDescription className="text-sm/[1.35] text-muted-foreground/70">{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Alert role="status">
      <AlertDescription className="text-foreground">{message} We&apos;ll keep trying.</AlertDescription>
    </Alert>
  );
}

import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("sq animate-pulse bg-muted [--r:16px]", className)}
      {...props}
    />
  )
}

export { Skeleton }

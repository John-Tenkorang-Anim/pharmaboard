import { type HTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";

// Not a card in the material sense — a ruled block on paper. Structure comes
// from hairlines and spacing, never from elevation.
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("border border-rule bg-paper-raised", className)} {...props} />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("border-b border-rule px-6 py-4", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("px-6 py-5", className)} {...props} />;
}

/** A section title in the institutional voice: tracked caps over a hairline. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-2">
      <h2 className="label-caps text-ink">{children}</h2>
      {aside}
    </div>
  );
}

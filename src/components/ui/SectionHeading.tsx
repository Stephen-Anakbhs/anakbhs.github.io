import { useRef } from "react";
import { useLiquidHeading } from "./liquidHeading";

export function SectionHeading({ title, body, level = 2 }: { title: string; body?: string; level?: 1 | 2 }) {
  const Heading = level === 1 ? "h1" : "h2";
  const heading = useRef<HTMLHeadingElement>(null);
  useLiquidHeading(heading);
  return (
    <div className="section-heading">
      <Heading ref={heading}>{title}</Heading>
      {body ? <span>{body}</span> : null}
    </div>
  );
}

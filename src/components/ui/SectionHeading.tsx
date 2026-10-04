import { installLiquidHeadingFilter } from "./liquidHeadingFilter";

installLiquidHeadingFilter();

export function SectionHeading({ title, body, level = 2 }: { title: string; body?: string; level?: 1 | 2 }) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="section-heading">
      <Heading>{title}</Heading>
      {body ? <span>{body}</span> : null}
    </div>
  );
}

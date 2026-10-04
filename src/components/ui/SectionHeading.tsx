type SectionHeadingProps = {
  kicker?: string;
  title: string;
  body?: string;
  level?: 1 | 2;
};

export function SectionHeading({ kicker, title, body, level = 2 }: SectionHeadingProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="section-heading">
      {kicker && <p>{kicker}</p>}
      <Heading>{title}</Heading>
      {body ? <span>{body}</span> : null}
    </div>
  );
}

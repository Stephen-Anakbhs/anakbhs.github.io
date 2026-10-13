import type { InlineContent } from "../../content/site";

export function Emoji({ src }: { src: string }) {
  return <img className="inline-emoji" src={src} alt="" aria-hidden="true" width={20} height={20} />;
}

/** Renders copy that mixes plain text, external links, and inline emoji images. */
export function InlineText({ parts }: { parts: InlineContent }) {
  return <>{parts.map((part, index) => typeof part === "string"
    ? part
    : "href" in part
      ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">{part.label}</a>
      : <Emoji key={index} src={part.emoji} />)}</>;
}

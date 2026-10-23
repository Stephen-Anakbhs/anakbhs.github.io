import { memo, useCallback, useState } from "react";
import { Code2, ExternalLink, FileText, Globe } from "lucide-react";
import { authorHomepages, emoji, type Publication, type PublicationAuthor } from "../../content/site";
import { GlassSurface } from "../ui/GlassSurface";
import { Emoji } from "../ui/InlineText";
import { ImageLightbox, preparePreview, type PreviewImage } from "../ui/ImageLightbox";

// Apple WebKit advertises AVIF but can lose animated alpha (WebKit bug 275906).
// iOS Chrome/Firefox also use this decoder; keep their transparent WebP fallback.
const preferAnimatedAvif = typeof navigator === "undefined" ||
  !(/AppleWebKit/i.test(navigator.userAgent) && !/(?:Chrome|Chromium)\/|Android/i.test(navigator.userAgent));

function Authors({ authors }: { authors: PublicationAuthor[] }) {
  return (
    <>
      {authors.map((author, index) => (
        <span key={author.name}>
          {index > 0 && ", "}
          <span className="publication-author">
            {author.name === "Renjun Gao" ? <strong className="publication-me">{author.name}</strong>
              : authorHomepages[author.name] ? <a href={authorHomepages[author.name]} target="_blank" rel="noopener noreferrer">{author.name}</a>
              : author.name}
            {author.equalContribution && <sup title="Equal contribution" aria-label="Equal contribution">*</sup>}
            {author.corresponding && <sup title="Corresponding author" aria-label="Corresponding author">{"\u2020"}</sup>}
          </span>
        </span>
      ))}
    </>
  );
}

// Venue abbreviations in parentheses, e.g. "(TOG)" or "(CAMWA)", are set in bold.
function Venue({ text }: { text: string }) {
  return <>{text.split(/(\([A-Z][A-Z0-9-]+\))/).map((part, index) => index % 2
    ? <span key={index}>(<strong>{part.slice(1, -1)}</strong>)</span> : part)}</>;
}

// The project name before the colon gets one colour per word (Brick · But · Agile).
function Title({ publication }: { publication: Publication }) {
  const colors = publication.nameColors;
  const colon = publication.title.indexOf(":");
  if (!colors?.length || colon < 0) return <>{publication.title}</>;
  const words = publication.title.slice(0, colon).split(" ");
  return <>
    {words.map((word, index) => <span key={index} style={{ color: colors[index % colors.length] }}>{index > 0 && " "}{word}</span>)}
    {publication.title.slice(colon)}
  </>;
}

type HeadingTag = "h2" | "h3";
type OpenPreview = (preview: PreviewImage) => void;

// Every entry lists its links in the same order.
const LINK_ORDER = ["Website", "Paper", "Code"];
const linkRank = (label: string) => (LINK_ORDER.indexOf(label) + LINK_ORDER.length + 1) % (LINK_ORDER.length + 1);

// Memoised so opening or closing the lightbox does not re-render every glass surface.
const PublicationItem = memo(function PublicationItem({ publication, Heading, onPreview }: { publication: Publication; Heading: HeadingTag; onPreview: OpenPreview }) {
  const primaryLink = publication.links?.find((link) => link.label === "Website" || link.label === "Paper");
  const image = publication.preview;
  const prepare = () => { if (image && !image.avifFull) void preparePreview(image.full); };
  return (
    <article className="publication-item" data-publication-id={publication.id}>
      <GlassSurface material="media" className="publication-media" padding="0px">
        <button
          className="publication-thumbnail"
          type="button"
          aria-label={`Enlarge image: ${publication.title}`}
          onPointerEnter={prepare}
          onFocus={prepare}
          onPointerDown={prepare}
          onClick={(event) => onPreview({
            src: image?.full ?? publication.image,
            avif: preferAnimatedAvif ? image?.avifFull : undefined,
            thumbnail: event.currentTarget.querySelector("img")?.currentSrc,
            natural: image ? { width: image.width, height: image.height } : undefined,
            alt: publication.title,
            origin: event.currentTarget.closest<HTMLElement>(".publication-media"),
          })}
        >
          <picture>
            {preferAnimatedAvif && image?.avifThumb && <source type="image/avif" srcSet={image.avifThumb} />}
            <img src={image?.thumb ?? publication.image} srcSet={image?.thumbSrcSet}
              sizes="(max-width: 640px) calc(100vw - 64px), (max-width: 740px) min(416px, calc(100vw - 72px)), 276px"
              style={image ? {
                margin: "auto",
                width: image.width / image.height >= 504 / 300 ? "100%" : "auto",
                height: image.width / image.height >= 504 / 300 ? "auto" : "100%",
                aspectRatio: `${image.width} / ${image.height}`, objectFit: "fill"
              } : undefined}
              alt={`Visual for ${publication.title}`} loading="lazy" decoding="async" />
          </picture>
        </button>
      </GlassSurface>
      <div className="publication-info">
        <Heading>
          {publication.logo && <img className="publication-logo" src={publication.logo} alt="" aria-hidden="true" />}
          {primaryLink ? (
            <a href={primaryLink.href} target="_blank" rel="noopener noreferrer"><Title publication={publication} /></a>
          ) : <Title publication={publication} />}
        </Heading>
        <p className="publication-authors"><Authors authors={publication.authors} /></p>
        <p className="publication-venue"><em><Venue text={publication.venue} /></em>{publication.year && <> · {publication.year}</>}</p>
        {publication.award && (
          <p className="publication-award">{publication.award}<Emoji src={emoji.trophy} /></p>
        )}
        {!!publication.links?.length && <div className="publication-links">
          {[...publication.links].sort((a, b) => linkRank(a.label) - linkRank(b.label)).map((link) => {
            const Icon = link.label === "Paper" ? FileText : link.label === "Code" ? Code2 : link.label === "Website" ? Globe : ExternalLink;
            return (
              <GlassSurface tone="light" key={link.label}>
                <a className="glass-action" href={link.href} target="_blank" rel="noopener noreferrer">
                  <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                  <span>{link.label}</span>
                </a>
              </GlassSurface>
            );
          })}
        </div>}
      </div>
    </article>
  );
});

export function PublicationList({ publications, headingLevel = 3 }: { publications: Publication[]; headingLevel?: 2 | 3 }) {
  const [preview, setPreview] = useState<PreviewImage | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);
  const Heading: HeadingTag = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="publication-list">
      <p className="publication-legend"><span><sup>*</sup> Equal contribution</span><span><sup>{"\u2020"}</sup> Corresponding author</span></p>
      {publications.map((publication) => (
        <PublicationItem key={publication.id} publication={publication} Heading={Heading} onPreview={setPreview} />
      ))}
      <ImageLightbox image={preview} onClose={closePreview} />
    </div>
  );
}

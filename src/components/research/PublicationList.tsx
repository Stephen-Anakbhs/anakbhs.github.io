import { memo, useCallback, useState } from "react";
import { Code2, ExternalLink, FileText, Globe, Star } from "lucide-react";
import type { Publication, PublicationAuthor } from "../../content/site";
import { GlassSurface } from "../ui/GlassSurface";
import { ImageLightbox, preparePreview, type PreviewImage } from "../ui/ImageLightbox";

function Authors({ authors }: { authors: PublicationAuthor[] }) {
  return (
    <>
      {authors.map((author, index) => (
        <span key={author.name}>
          {index > 0 && ", "}
          <span className="publication-author">
            {author.name === "Renjun Gao" ? <strong>{author.name}</strong> : author.name}
            {author.equalContribution && <sup title="Equal contribution" aria-label="Equal contribution">*</sup>}
            {author.corresponding && <sup title="Corresponding author" aria-label="Corresponding author">{"\u2020"}</sup>}
          </span>
        </span>
      ))}
    </>
  );
}

type HeadingTag = "h2" | "h3";
type OpenPreview = (preview: PreviewImage) => void;

// Memoised so opening or closing the lightbox does not re-render every glass surface.
const PublicationItem = memo(function PublicationItem({ publication, Heading, onPreview }: { publication: Publication; Heading: HeadingTag; onPreview: OpenPreview }) {
  const primaryLink = publication.links?.find((link) => link.label === "Website" || link.label === "Paper");
  const image = publication.preview;
  const prepare = () => { if (image && !image.avifFull) void preparePreview(image.full); };
  return (
    <article className="publication-item" data-publication-id={publication.id}>
      <GlassSurface material="media" className="publication-media">
        <button
          className="publication-thumbnail"
          type="button"
          aria-label={`Enlarge image: ${publication.title}`}
          onPointerEnter={prepare}
          onFocus={prepare}
          onPointerDown={prepare}
          onClick={(event) => onPreview({
            src: image?.full ?? publication.image,
            avif: image?.avifFull,
            thumbnail: event.currentTarget.querySelector("img")?.currentSrc,
            natural: image ? { width: image.width, height: image.height } : undefined,
            alt: publication.title,
            origin: event.currentTarget.closest<HTMLElement>(".publication-media"),
          })}
        >
          <picture>
            {image?.avifThumb && <source type="image/avif" srcSet={image.avifThumb} />}
            <img src={image?.thumb ?? publication.image} srcSet={image?.thumbSrcSet}
              sizes="(max-width: 640px) calc(100vw - 64px), (max-width: 740px) min(416px, calc(100vw - 72px)), 276px"
              style={image ? {
                inset: "auto", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
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
          {primaryLink ? (
            <a href={primaryLink.href} target="_blank" rel="noopener noreferrer">{publication.title}</a>
          ) : publication.title}
        </Heading>
        <p className="publication-authors"><Authors authors={publication.authors} /></p>
        <p className="publication-venue"><em>{publication.venue}</em>{publication.year && <> · {publication.year}</>}</p>
        {publication.award && (
          <p className="publication-award">
            <Star size={19} fill="currentColor" strokeWidth={0} aria-hidden="true" />
            <span>{publication.award}</span>
            <Star size={19} fill="currentColor" strokeWidth={0} aria-hidden="true" />
          </p>
        )}
        {!!publication.links?.length && <div className="publication-links">
          {publication.links.map((link) => {
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

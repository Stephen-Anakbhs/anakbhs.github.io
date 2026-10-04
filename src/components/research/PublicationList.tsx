import { useState } from "react";
import { Code2, ExternalLink, FileText, Globe, Maximize2, Star } from "lucide-react";
import type { Publication, PublicationAuthor } from "../../content/site";
import { GlassSurface } from "../ui/GlassSurface";
import { ImageLightbox, type PreviewImage } from "../ui/ImageLightbox";

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

export function PublicationList({ publications, headingLevel = 3 }: { publications: Publication[]; headingLevel?: 2 | 3 }) {
  const [preview, setPreview] = useState<PreviewImage | null>(null);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="publication-list">
      <p className="publication-legend"><span><sup>*</sup> Equal contribution</span><span><sup>{"\u2020"}</sup> Corresponding author</span></p>
      {publications.map((publication) => {
        const primaryLink = publication.links?.find((link) => link.label === "Website" || link.label === "Paper");

        return (
          <article className="publication-item" key={publication.id} data-publication-id={publication.id}>
            <GlassSurface material="media" className="publication-media">
              <button
                className="publication-thumbnail"
                type="button"
                aria-label={`Enlarge image: ${publication.title}`}
                title="Enlarge image"
                onClick={() => setPreview({ src: publication.image, alt: publication.title })}
              >
                <img src={publication.image} alt={`Visual for ${publication.title}`} loading="lazy" decoding="async" />
                <span className="publication-zoom"><Maximize2 size={17} aria-hidden="true" /></span>
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
                {publication.links?.map((link) => {
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
      })}
      <ImageLightbox image={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

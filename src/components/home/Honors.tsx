import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import { site, type HonorHighlight } from "../../content/site";
import { GlassSurface } from "../ui/GlassSurface";
import { ImageLightbox, preparePreview, type PreviewImage } from "../ui/ImageLightbox";
import { Emoji } from "../ui/InlineText";

type Award = (typeof site.awards)[number];

const SLIDE_MS = 4000;

// Steps a multi-photo card while it is on screen; hover, focus or reduced motion holds the current photo.
function useSlideshow(count: number, frame: RefObject<HTMLElement | null>) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = frame.current;
    if (count < 2 || !element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.3 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [count]);
  useEffect(() => {
    if (count < 2 || !visible || held || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Hold still while a viewer is open, so closing it lands on the photo it shows.
    const timer = window.setInterval(() => {
      if (!document.documentElement.classList.contains("glass-dialog-open")) setIndex((current) => (current + 1) % count);
    }, SLIDE_MS);
    return () => clearInterval(timer);
  }, [count, visible, held, index]);
  return { index, setIndex, setHeld };
}

// Memoised so opening or closing the lightbox does not re-render every glass frame.
const HonorCard = memo(function HonorCard({ honor, onPreview }: { honor: HonorHighlight; onPreview: (preview: PreviewImage) => void }) {
  const frameRef = useRef<HTMLButtonElement>(null);
  const { index, setIndex, setHeld } = useSlideshow(honor.images.length, frameRef);
  const current = honor.images[index];
  const prepare = () => { void preparePreview(current.full); };
  return (
    <figure className="honor-card" data-track-item={`honor:${honor.id}`}
      onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
      <GlassSurface material="media" className="honor-media">
        <button
          ref={frameRef}
          className="honor-thumbnail"
          type="button"
          aria-label={`Enlarge image: ${honor.title}, ${honor.venue}`}
          onPointerEnter={prepare}
          onFocus={prepare}
          onPointerDown={prepare}
          onClick={(event) => onPreview({
            src: current.full,
            thumbnail: event.currentTarget.querySelector<HTMLImageElement>("img[data-active]")?.currentSrc,
            natural: { width: current.width, height: current.height },
            alt: current.label ? `${current.label.name} · ${current.label.year}` : `${honor.title} · ${honor.venue}`,
            origin: event.currentTarget.closest<HTMLElement>(".honor-media"),
            slides: honor.images.length > 1 ? honor.images.map((image) => ({
              src: image.full, thumbnail: image.thumb, natural: { width: image.width, height: image.height }, alt: image.alt ?? honor.title,
              caption: image.label ? `${image.label.name} · ${image.label.year}` : undefined,
            })) : undefined,
            slide: index,
            onSlide: setIndex,
          })}
        >
          {honor.images.map((image, i) => (
            <img key={image.thumb} src={image.thumb} alt={i === index ? image.alt ?? honor.title : ""} data-fit={image.fit ?? honor.fit}
              data-active={i === index ? "" : undefined} loading="lazy" decoding="async" />
          ))}
          {honor.images.map((image, i) => image.label && (
            <span key={`label-${image.thumb}`} className="honor-label" data-active={i === index ? "" : undefined} aria-hidden="true">
              <b>{image.label.year}</b><i> · {image.label.name}</i>
            </span>
          ))}
        </button>
        {honor.images.length > 1 && <div className="honor-dots" role="group" aria-label={`${honor.title} photos`}>
          {honor.images.map((image, i) => (
            <button key={image.thumb} type="button" aria-label={`Show photo ${i + 1} of ${honor.images.length}`}
              aria-current={i === index ? "true" : undefined} onClick={() => setIndex(i)} />
          ))}
        </div>}
      </GlassSurface>
      <figcaption>
        <strong>{honor.title}</strong>
        <span>{honor.venue}</span>
      </figcaption>
    </figure>
  );
});

// Keeps each matched line on one line: if any would wrap, all of them shrink by the same factor (written to
// `variable` on the container). With `media`, fitting only applies while that query matches.
function useOneLine(container: RefObject<HTMLElement | null>, lines: string, variable: string, media?: string) {
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    let width = -1;
    const fit = () => {
      element.style.setProperty(variable, "1");
      if (media && !matchMedia(media).matches) return;
      let scale = 1;
      element.querySelectorAll<HTMLElement>(lines).forEach((line) => {
        if (line.scrollWidth > line.clientWidth) scale = Math.min(scale, line.clientWidth / line.scrollWidth);
      });
      element.style.setProperty(variable, String(scale < 1 ? Math.max(0.5, scale * 0.98) : 1));
    };
    // Watch one line's box: it changes both with the container and when the grid changes its column count.
    // Fit before the first paint, and refit a frame after a resize: resizing text inside the observer
    // callback would itself be a resize the observer cannot deliver (WebKit reports a ResizeObserver loop).
    const probe = element.querySelector<HTMLElement>(lines) ?? element;
    let frame = 0;
    width = probe.clientWidth;
    fit();
    const observer = new ResizeObserver(() => {
      if (Math.abs(probe.clientWidth - width) < 0.5) return;
      width = probe.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer.observe(probe);
    void document.fonts?.ready.then(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
}

export function HonorsGallery({ honors }: { honors: HonorHighlight[] }) {
  const [preview, setPreview] = useState<PreviewImage | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);
  const gridRef = useRef<HTMLDivElement>(null);
  useOneLine(gridRef, ".honor-card figcaption > *", "--caption-fit");
  return (
    <>
      <div className="honors-grid" ref={gridRef} aria-label="Selected honors">
        {honors.map((honor) => <HonorCard key={honor.id} honor={honor} onPreview={setPreview} />)}
      </div>
      <ImageLightbox image={preview} onClose={closePreview} />
    </>
  );
}

function AwardItem({ award }: { award: Award }) {
  return (
    <li className={award.title === "President's Gold Medal" ? "award-gold" : undefined}>
      <span className="award-date">{award.date}</span>
      <p>
        {award.lead}{" "}
        <strong>{"href" in award ? <a href={award.href} target="_blank" rel="noopener noreferrer">{award.title}</a> : award.title}</strong>
        {award.emoji && <Emoji src={award.emoji} />}{" "}
        {award.detail}
      </p>
    </li>
  );
}

const VISIBLE_AWARDS = 6;

// The newest awards stay visible; the rest slide open below them.
export function AwardsList({ awards }: { awards: Award[] }) {
  const [expanded, setExpanded] = useState(false);
  const moreId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  useOneLine(listRef, ".awards-list p", "--award-fit", "(min-width: 641px)");
  const head = awards.slice(0, VISIBLE_AWARDS);
  const rest = awards.slice(VISIBLE_AWARDS);
  const key = (award: Award) => `${award.date}-${award.title}`;
  return (
    <div className="awards-block" ref={listRef}>
      <ul className="awards-list">{head.map((award) => <AwardItem key={key(award)} award={award} />)}</ul>
      {rest.length > 0 && <>
        <div className="awards-more" id={moreId} data-expanded={expanded ? "" : undefined} inert={!expanded}>
          <ul className="awards-list">{rest.map((award) => <AwardItem key={key(award)} award={award} />)}</ul>
        </div>
        <div className="awards-toggle-row">
          <GlassSurface tone="light">
            <button className="glass-action awards-toggle" type="button" aria-expanded={expanded} aria-controls={moreId}
              onClick={() => setExpanded((open) => !open)}>
              <span>{expanded ? "Show less" : "Show more"}</span>
              <ChevronDown size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </GlassSurface>
        </div>
      </>}
    </div>
  );
}

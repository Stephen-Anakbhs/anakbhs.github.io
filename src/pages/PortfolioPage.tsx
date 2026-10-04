import { Play } from "lucide-react";
import { ProjectGallery } from "../components/portfolio/ProjectGallery";
import { SectionHeading } from "../components/ui/SectionHeading";
import { site } from "../content/site";

export function PortfolioPage() {
  return (
    <main className="subpage portfolio-page">
      <SectionHeading kicker="Projects" title="Selected Projects" />

      <ProjectGallery items={site.showcase} />

      <section className="subsection video-feature">
        <div className="video-copy">
          <SectionHeading kicker="LEGO Bus" title={site.video.title} body={site.video.body} />
          <a href={site.video.href} target="_blank" rel="noreferrer" className="section-link">
            <Play size={18} />
            Watch on YouTube
          </a>
        </div>
        <div className="video-frame">
          <iframe
            src={site.video.embed}
            title={site.video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </section>
    </main>
  );
}

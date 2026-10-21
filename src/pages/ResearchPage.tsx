import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PublicationList } from "../components/research/PublicationList";
import { GlassSurface } from "../components/ui/GlassSurface";
import { SectionHeading } from "../components/ui/SectionHeading";
import { site } from "../content/site";

export function ResearchPage() {
  return (
    <main className="research-page" id="main-content" tabIndex={-1}>
      <section className="page-section publication-section research-index" data-track-section="publication-list">
        <div className="section-inner">
          <div className="back-link">
            <GlassSurface tone="light">
              <Link className="glass-action" to="/#publications">
                <ArrowLeft size={17} aria-hidden="true" /> Back to selected publications
              </Link>
            </GlassSurface>
          </div>
          <SectionHeading title="Publications" level={1} />
          <PublicationList publications={site.publications} headingLevel={2} />
        </div>
      </section>
    </main>
  );
}

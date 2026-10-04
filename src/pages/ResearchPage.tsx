import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PublicationList } from "../components/research/PublicationList";
import { SectionHeading } from "../components/ui/SectionHeading";
import { site } from "../content/site";

export function ResearchPage() {
  return (
    <main className="research-page" id="main-content" tabIndex={-1}>
      <section className="page-section publication-section research-index">
        <div className="section-inner">
          <Link className="text-link back-link" to="/#publications">
            <ArrowLeft size={17} aria-hidden="true" /> Back to selected publications
          </Link>
          <SectionHeading title="Publications" level={1} />
          <PublicationList publications={site.publications} headingLevel={2} />
        </div>
      </section>
    </main>
  );
}

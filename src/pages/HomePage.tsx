import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { AboutIntro } from "../components/home/AboutIntro";
import { CareerList } from "../components/home/CareerList";
import { Hero } from "../components/home/Hero";
import { AwardsList, HonorsGallery } from "../components/home/Honors";
import { MembershipList } from "../components/home/MembershipList";
import { ProjectGallery } from "../components/portfolio/ProjectGallery";
import { PublicationList } from "../components/research/PublicationList";
import { GlassSurface } from "../components/ui/GlassSurface";
import { InlineText } from "../components/ui/InlineText";
import { SectionHeading } from "../components/ui/SectionHeading";
import { site } from "../content/site";

export function HomePage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <Hero />

      <section className="page-section about-band" id="about" data-nav-section="about">
        <AboutIntro />
      </section>

      <section className="page-section news-section" id="news" data-nav-section="about">
        <SectionHeading title="News" />
        <div className="section-body">
        <ul className="news-list">
          {site.news.map((item) => (
            <li key={`${item.date}-${item.href}`}>
              <span className="news-date">{item.date}</span>
              <p>
                <InlineText parts={typeof item.text === "string" ? [item.text] : item.text} />{" "}
                <a href={item.href} {...(item.href.startsWith("#") ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
                  {item.label}<ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </p>
            </li>
          ))}
        </ul>
        </div>
      </section>

      <section className="page-section publication-section" id="publications" data-nav-section="publications">
        <div className="section-inner">
          <span id="research" className="anchor-alias" aria-hidden="true" />
          <SectionHeading title="Selected Publications" />
          <div className="section-body">
          <PublicationList publications={site.publications.filter((publication) => publication.selected)} />
          <div className="publication-index-link">
            <GlassSurface tone="light">
              <Link className="glass-action" to="/publications">
                View full publication list <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </GlassSurface>
          </div>
          </div>
        </div>
      </section>

      <section className="page-section image-showcase" id="projects" data-nav-section="projects">
        <SectionHeading title="Projects" />
        <div className="section-body media-body"><ProjectGallery items={site.showcase} /></div>
      </section>

      <section className="page-section experience-section" id="experience" data-nav-section="about">
        <SectionHeading title="Experience" />
        <div className="section-body"><CareerList items={site.experience} /></div>
      </section>

      <section className="page-section education-section" id="education" data-nav-section="about">
        <SectionHeading title="Education" />
        <div className="section-body"><CareerList items={site.education} /></div>
      </section>

      <section className="page-section awards-section" id="awards" data-nav-section="about">
        <SectionHeading title="Honors & Awards" />
        <div className="section-body media-body">
          <HonorsGallery honors={site.honors} />
          <AwardsList awards={site.awards} />
        </div>
      </section>

      <section className="page-section membership-section" id="membership" data-nav-section="about">
        <SectionHeading title="Membership" />
        <div className="section-body"><MembershipList items={site.memberships} /></div>
      </section>

      {site.portfolio.length > 0 && (
        <section className="page-section portfolio-section" id="portfolio" data-nav-section="about">
          <SectionHeading title="Portfolio" />
          <div className="section-body media-body"><ProjectGallery items={site.portfolio} kind="portfolio" /></div>
        </section>
      )}

    </main>
  );
}

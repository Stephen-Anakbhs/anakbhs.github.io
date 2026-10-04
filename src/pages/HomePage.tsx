import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { AboutIntro } from "../components/home/AboutIntro";
import { CareerList } from "../components/home/CareerList";
import { Hero } from "../components/home/Hero";
import { MembershipList } from "../components/home/MembershipList";
import { ProjectGallery } from "../components/portfolio/ProjectGallery";
import { PublicationList } from "../components/research/PublicationList";
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
        <ul className="news-list">
          {site.news.map((item) => (
            <li key={item.text}>
              <span className="news-date">{item.date}</span>
              <p>
                {item.text}{" "}
                <a href={item.href} {...(item.href.startsWith("#") ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
                  {item.label}<ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="page-section publication-section" id="publications" data-nav-section="publications">
        <div className="section-inner">
          <span id="research" className="anchor-alias" aria-hidden="true" />
          <SectionHeading title="Selected Publications" />
          <PublicationList publications={site.publications.filter((publication) => publication.selected)} />
          <Link className="text-link publication-index-link" to="/publications">
            View full publication list <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="page-section image-showcase" id="projects" data-nav-section="projects">
        <SectionHeading title="Projects" />
        <ProjectGallery items={site.showcase} />
      </section>

      <section className="page-section experience-section" id="experience" data-nav-section="about">
        <SectionHeading title="Experience" />
        <CareerList items={site.experience} />
      </section>

      <section className="page-section education-section" id="education" data-nav-section="about">
        <SectionHeading title="Education" />
        <CareerList items={site.education} />
      </section>

      <section className="page-section awards-section" id="awards" data-nav-section="about">
        <SectionHeading title="Awards & Honors" />
        <ul className="awards-list">
          {site.awards.map((award) => (
            <li key={`${award.date}-${award.title}`} className={award.title === "President's Gold Medal" ? "award-gold" : undefined}>
              <span className="award-date">{award.date}</span>
              <p>
                {award.lead}{" "}
                <strong>{"href" in award ? <a href={award.href} target="_blank" rel="noopener noreferrer">{award.title}</a> : award.title}</strong>{" "}
                {award.detail}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="page-section membership-section" id="membership" data-nav-section="about">
        <SectionHeading title="Membership" />
        <MembershipList items={site.memberships} />
      </section>

    </main>
  );
}

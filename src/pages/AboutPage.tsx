import { SectionHeading } from "../components/ui/SectionHeading";
import { AboutIntro } from "../components/home/AboutIntro";
import { CareerList } from "../components/home/CareerList";
import { MembershipList } from "../components/home/MembershipList";
import { site } from "../content/site";

export function AboutPage() {
  return (
    <main className="subpage about-page">
      <section className="about-band subpage-band">
        <AboutIntro />
      </section>

      <section className="subsection">
        <SectionHeading title="Experience" />
        <CareerList items={site.experience} />
      </section>
      <section className="subsection">
        <SectionHeading title="Education" />
        <CareerList items={site.education} />
      </section>

      <section className="subsection membership-section">
        <SectionHeading title="Membership" />
        <MembershipList items={site.memberships} />
      </section>
    </main>
  );
}

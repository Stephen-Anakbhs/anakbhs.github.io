import { site } from "../../content/site";
import { GlassIconLink } from "../ui/GlassIconLink";
import { GlassSurface } from "../ui/GlassSurface";
import { SectionHeading } from "../ui/SectionHeading";

export function AboutIntro() {
  return (
    <>
      <div className="about-copy">
        <SectionHeading title="About Me" />
        <p>{site.about.introduction} {site.about.interests}</p>
        <p>{site.about.background}</p>
        <p>{site.about.personal}</p>
        <div className="social-row">
          {site.socials.map((item) => <GlassIconLink key={item.label} {...item} />)}
        </div>
      </div>
      <GlassSurface material="media" className="about-portrait">
        <img src="/media/profile-lego-exhibition.jpg" alt="Renjun Gao at a LEGO exhibition" loading="lazy" decoding="async" width={481} height={571} />
      </GlassSurface>
    </>
  );
}

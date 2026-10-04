import type { LucideIcon } from "lucide-react";
import {
  Atom,
  BookOpenText,
  Bot,
  Boxes,
  BusFront,
  Cpu,
  GraduationCap,
  Hand,
  Mail,
  Orbit,
  PenTool,
  Satellite,
  Sparkles
} from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  href: string;
};

export type SocialItem = {
  label: string;
  href: string;
  icon: LucideIcon | string;
};

export type FeatureItem = {
  label: string;
  title: string;
  body: string;
  icon: LucideIcon;
};

export type PublicationAuthor = {
  name: string;
  equalContribution?: boolean;
  corresponding?: boolean;
};

export type Publication = {
  id: string;
  title: string;
  authors: PublicationAuthor[];
  venue: string;
  year?: string;
  award?: string;
  image: string;
  selected?: boolean;
  links?: { label: string; href: string }[];
};

export type ShowcaseItem = {
  id: string;
  title: string;
  summary: string;
  body: string;
  image: string;
  imageFit?: "cover" | "contain";
  detailImage: string;
  video?: string;
  href?: string;
};

export type Membership = {
  title: string;
  subtitle: string;
  period: string;
  body: string;
  logo?: string;
  links: { label: string; href: string }[];
};

export type CareerEntry = {
  period: string;
  institution: string;
  href: string;
  logo: string;
  role: string;
  group: string;
  groupHref?: string;
  mentors?: { name: string; href?: string }[];
  description: string;
};

const scholarProfile = "https://scholar.google.com/citations?user=qM5-vjQAAAAJ&hl=zh-CN&oi=sra";

export const site = {
  name: "Renjun Gao",
  shortName: "Renjun Gao",
  domain: "renjun.one",
  github: "https://github.com/Stephen-Anakbhs",
  linkedin: "https://www.linkedin.com/in/renjun-gao/",
  scholar: scholarProfile,
  emailHref: "mailto:renjgao@gmail.com",
  hero: {
    media: {
      poster: "/media/hero-video-poster.webp",
      video: "/media/hero-background-1080p.mp4"
    },
    title: "Hi, I'm Renjun (Stephen) Gao.",
    prefix: "Work on",
    words: [
      "robot learning.",
      "dexterous manipulation.",
      "robotic mechanisms."
    ]
  },
  nav: [
    { id: "home", label: "Home", href: "/#home" },
    { id: "about", label: "About", href: "/#about" },
    { id: "publications", label: "Publications", href: "/#publications" },
    { id: "projects", label: "Projects", href: "/#projects" }
  ] satisfies NavItem[],
  socials: [
    { label: "Google Scholar", href: scholarProfile, icon: "/media/icons/googlescholar.svg" },
    { label: "GitHub", href: "https://github.com/Stephen-Anakbhs", icon: "/media/icons/github.svg" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/renjun-gao/", icon: "/media/icons/linkedin.svg" },
    { label: "Bilibili", href: "https://space.bilibili.com/162983506", icon: "/media/icons/bilibili.svg" },
    { label: "YouTube", href: "https://www.youtube.com/@anakbhs2782", icon: "/media/icons/youtube.svg" },
    { label: "Email", href: "mailto:renjgao@gmail.com", icon: Mail }
  ] satisfies SocialItem[],
  about: {
    introduction: "I'm Renjun Gao (高仁俊), a computer science graduate from Macau University of Science and Technology.",
    interests: "My research interests are robot learning, dexterous manipulation, and whole-body control, with a focus on the interaction between mechanical design and control.",
    background: "I have worked on humanoid teleoperation at USC, robot prototyping at Tsinghua AIR, phase-field methods for 3D reconstruction at MUST, and remote-sensing vision at HKUST.",
    personal: "Outside of research, I design LEGO mechanisms and build working models, from a fully motorized Macau bus to compact dexterous hands."
  },
  news: [
    { date: "May 2026", text: "I won the President's Gold Medal at MUST (2 of ~3,000 graduates; top ~0.067%).", href: "#awards", label: "Award" },
    { date: "2026", text: "Brick But Agile, GestureFuse, and MarsCanon are in submission.", href: "#publications", label: "Publications" },
    { date: "Aug. 2026", text: "RSC-GestureNet won an Outstanding Student Paper Award at PRCV 2026.", href: "https://arxiv.org/abs/2608.02200", label: "Paper" },
    { date: "2026", text: "LC4-DViT and MVT were accepted to IGARSS 2026. LC4-DViT was named a Best Student Paper Finalist.", href: "https://charlescsyyy.github.io/LC4-DViT/", label: "Project" },
    { date: "2026", text: "Our paper on energy-stable 3D narrow-volume reconstruction was published in Computers & Mathematics with Applications.", href: "https://doi.org/10.1016/j.camwa.2025.11.009", label: "Paper" }
  ],
  experience: [
    {
      period: "2025",
      institution: "University of Southern California",
      href: "https://www.usc.edu/",
      logo: "/media/logos/psi-lab.svg",
      role: "Research Assistant",
      group: "Physical Superintelligence Lab",
      groupHref: "https://psi-lab.ai/",
      mentors: [{ name: "Yue Wang", href: "https://yuewang.xyz/" }],
      description: "Humanoid teleoperation and whole-body control for Unitree G1, including motion retargeting, trajectory optimization, weighted inverse kinematics, and Apple Vision Pro sim-to-real deployment."
    },
    {
      period: "2025",
      institution: "The Hong Kong University of Science and Technology",
      href: "https://hkust.edu.hk/",
      logo: "/media/logos/hkust.svg",
      role: "Research Assistant",
      group: "Remote-sensing research",
      mentors: [{ name: "Dasa Gu", href: "https://dasagu.people.ust.hk/" }, { name: "Cheng Li", href: "https://github.com/chengli24" }],
      description: "Land-cover recognition and vision-language models for remote-sensing imagery, including LC4-DViT and MVT."
    },
    {
      period: "Jul. - Dec. 2024",
      institution: "Tsinghua University",
      href: "https://air.tsinghua.edu.cn/en/",
      logo: "/media/logos/tsinghua-air-transparent-hq.webp",
      role: "Research Assistant",
      group: "Institute for AI Industry Research, DISCOVER Lab",
      groupHref: "https://www.discover-lab.com/",
      mentors: [{ name: "Guyue Zhou", href: "https://air.tsinghua.edu.cn/en/info/1046/1196.htm" }],
      description: "Mechanical design and integration of a LEGO-based wheel-legged robot, with custom motor adapters, ESP32 electronics, IMU state estimation, and low-level stabilization experiments."
    },
    {
      period: "From Oct. 2023",
      institution: "Macau University of Science and Technology",
      href: "https://www.must.edu.mo/",
      logo: "/media/logos/must-highres.png",
      role: "Research Assistant",
      group: "Phase-Field & Computational Fluid Dynamics Team",
      groupHref: "https://cfdyang521.github.io/",
      mentors: [{ name: "Junxiang Yang", href: "https://cfdyang521.github.io/" }],
      description: "Energy-stable numerical methods for phase-field models, with applications to 3D reconstruction, shape transformation, and image segmentation."
    }
  ] satisfies CareerEntry[],
  education: [
    {
      period: "Class of 2026",
      institution: "Macau University of Science and Technology",
      href: "https://www.must.edu.mo/",
      logo: "/media/logos/must-highres.png",
      role: "B.Sc. in Computer Science",
      group: "Faculty of Innovation Engineering",
      groupHref: "https://fie.must.edu.mo/",
      description: ""
    }
  ] satisfies CareerEntry[],
  awards: [
    { date: "Aug. 2026", lead: "RSC-GestureNet won an", title: "Outstanding Student Paper Award", detail: "at PRCV 2026." },
    { date: "May 2026", lead: "Awarded the", title: "President's Gold Medal", detail: "at MUST (2 of ~3,000 graduates; top ~0.067%)." },
    { date: "Mar. 2026", lead: "LC4-DViT was named a", title: "Best Student Paper Finalist", detail: "at IGARSS 2026." },
    { date: "Nov. 2025", lead: "Awarded the", title: "Henry Fok Foundation Scholarship", detail: "at MUST." },
    { date: "Sep. 2025", lead: "Named to the", title: "Dean's Honor List", detail: "with a scholarship; ranked first in my cohort." },
    { date: "Dec. 2024", lead: "Received the", title: "IET Prize", detail: "from IET Hong Kong.", href: "https://fie.must.edu.mo/news/article/view/id-32132.html?locale=en_US" },
    { date: "Nov. 2024", lead: "Awarded the", title: "Henry Fok Foundation Scholarship", detail: "at MUST." },
    { date: "Nov. 2024", lead: "Won", title: "Second Prize", detail: "in the national CUMCM.", href: "https://fie.must.edu.mo/news/article/view/id-32681.html?locale=en_US" },
    { date: "Sep. 2024", lead: "Named to the", title: "Dean's Honor List", detail: "with a scholarship; ranked first in my cohort." },
    { date: "Nov. 2023", lead: "Awarded the", title: "O Man Cheong Scholarship", detail: "at MUST." },
    { date: "Sep. 2023", lead: "Named to the", title: "Dean's Honor List", detail: "with a scholarship; ranked first in my cohort." },
    { date: "Jul. 2023", lead: "Won the", title: "Best Group Presentation Award", detail: "at HKU Summer Institute." }
  ],
  architecture: [
    {
      label: "01",
      title: "Academic signal first",
      body: "The site keeps publications, research roles, and project evidence scannable, even when the first screen is cinematic.",
      icon: GraduationCap
    },
    {
      label: "02",
      title: "Three.js as atmosphere",
      body: "The 3D layer adds depth and motion behind the hero image, while the text and routes remain normal, fast, and accessible.",
      icon: Orbit
    },
    {
      label: "03",
      title: "Visual project archive",
      body: "Robotics, LEGO mechanisms, and research figures are presented as an image-led portfolio instead of a plain resume list.",
      icon: Boxes
    },
    {
      label: "04",
      title: "Markdown blog",
      body: "Blog posts are file-backed Markdown entries, ready for research notes, project logs, essays, and design writing.",
      icon: BookOpenText
    }
  ] satisfies FeatureItem[],
  focusAreas: [
    {
      title: "Humanoid whole-body teleoperation",
      body:
        "At USC, I worked on a Unitree G1 teleoperation stack using AMASS retargeting, multi-contact trajectory optimization, weighted IK, MuJoCo validation, and Apple Vision Pro sim-to-real deployment.",
      image: "/media/g1-teleoperation.png",
      icon: Bot
    },
    {
      title: "Phase-field computational methods",
      body:
        "In MUST PF_CFD, I developed and co-developed energy-stable Allen-Cahn phase-field schemes for 3D narrow volume reconstruction, shell reconstruction, shape transformation, and image segmentation.",
      image: "/media/pf-reconstruction.png",
      icon: Atom
    },
    {
      title: "Wheel-legged robot mechanism and control",
      body:
        "At Tsinghua AIR DISCOVER Lab, I led a LEGO-based five-link wheel-legged robot prototype integrating CAD, PCB, ESP32 control, IMU feedback, Kalman filtering, and PID stabilization.",
      image: "/media/wheel-robot.png",
      icon: Cpu
    },
    {
      title: "Remote sensing under uncertainty",
      body:
        "At HKUST, I contributed to LC4-DViT and MVT, two IGARSS 2026 accepted works on land-cover classification and taxonomy-aligned land-cover tagging.",
      image: "/media/lc4dvit.png",
      icon: Satellite
    },
    {
      title: "LEGO dexterous manipulation",
      body:
        "ShiftHand is a 100% LEGO Technic tendon-driven dexterous hand with a contact-triggered automatic two-speed transmission for adaptive grasping.",
      image: "/media/shifthand.png",
      icon: Hand
    }
  ],
  publications: [
    {
      id: "TOG",
      title: "3D volume reconstruction based on a phase-field model with high-order polynomials free energy",
      authors: [{ name: "Sheng Su" }, { name: "Renjun Gao" }, { name: "Dongting Cai" }, { name: "Xiangjie Kong" }, { name: "Junxiang Yang", corresponding: true }],
      venue: "ACM Transactions on Graphics (TOG), under review",
      image: "/media/pub-high-order-tog.png"
    },
    {
      id: "BBA",
      title: "Brick But Agile: A Compact, Modular Anthropomorphic LEGO\u00ae Dexterous Hand for Education and Research",
      authors: [
        { name: "Renjun Gao", corresponding: true },
        { name: "Cheng Li", corresponding: true },
        { name: "Yuhang Hu" },
        { name: "Xiaolei Ren" },
        { name: "Guyue Zhou", corresponding: true }
      ],
      venue: "In submission",
      image: "/media/pub-brick-but-agile.png",
      selected: true
    },
    {
      id: "GF",
      title: "GestureFuse: Exploiting Graph-Transformer Complementarity for Traffic-Control Gesture Recognition",
      authors: [
        { name: "Cheng Li", equalContribution: true, corresponding: true },
        { name: "Renjun Gao", equalContribution: true, corresponding: true },
        { name: "Chenhao Guan", equalContribution: true },
        { name: "Boyi Fu" },
        { name: "Xiaolei Ren" }
      ],
      venue: "In submission",
      image: "/media/pub-gesturefuse.png",
      selected: true
    },
    {
      id: "MC",
      title: "MarsCanon: Exact Identity-Footprint Consistency for Martian Surface Segmentation",
      authors: [
        { name: "Cheng Li", equalContribution: true, corresponding: true },
        { name: "Renjun Gao", equalContribution: true, corresponding: true },
        { name: "Ziru Chen" },
        { name: "Weicong Pang" },
        { name: "Xiaolei Ren" }
      ],
      venue: "In submission",
      image: "/media/pub-marscanon.png",
      selected: true
    },
    {
      id: "RSC",
      title: "RSC-GestureNet: Reliability-Aware Selective Causal Recognition of Chinese Traffic Police Gestures",
      authors: [
        { name: "Cheng Li", equalContribution: true, corresponding: true },
        { name: "Renjun Gao", equalContribution: true, corresponding: true },
        { name: "Boyi Fu" }
      ],
      venue: "Chinese Conference on Pattern Recognition and Computer Vision (PRCV), oral presentation",
      year: "2026",
      award: "Outstanding Student Paper",
      image: "/media/pub-rsc-gesturenet.png",
      selected: true,
      links: [
        { label: "Paper", href: "https://arxiv.org/pdf/2608.02200" },
        { label: "Code", href: "https://github.com/chengli24/rsc-gesturenet-prcv2026" }
      ]
    },
    {
      id: "P1",
      title:
        "Three-dimensional narrow volume reconstruction method with unconditional stability based on a phase-field Lagrange multiplier approach",
      authors: [{ name: "Renjun Gao" }, { name: "Xiangjie Kong" }, { name: "Dongting Cai" }, { name: "Boyi Fu" }, { name: "Junxiang Yang", corresponding: true }],
      venue: "Computers & Mathematics with Applications (CAMWA), vol. 202, pp. 88-112",
      year: "2026",
      image: "/media/pub-lagrange-reconstruction.png",
      selected: true,
      links: [
        { label: "Code", href: "https://github.com/cfdyang521/C-3PO/tree/main" },
        { label: "Paper", href: "https://doi.org/10.1016/j.camwa.2025.11.009" }
      ]
    },
    {
      id: "P2",
      title: "Two lower boundedness-preservity auxiliary variable methods for a phase-field model of 3D narrow volume reconstruction",
      authors: [{ name: "Xiangjie Kong" }, { name: "Renjun Gao" }, { name: "Boyi Fu" }, { name: "Dongting Cai" }, { name: "Junxiang Yang", corresponding: true }],
      venue: "Communications in Nonlinear Science and Numerical Simulation (CNSNS), vol. 143, 108649",
      year: "2025",
      image: "/media/pub-two-lower-bounds.png",
      links: [{ label: "Paper", href: "https://doi.org/10.1016/j.cnsns.2025.108649" }]
    },
    {
      id: "P3",
      title: "Second-order accurate, maximum principle-preserving, and convergent schemes for the phase-field shape transformation model",
      authors: [{ name: "Sheng Su" }, { name: "Renjun Gao" }, { name: "Junxiang Yang", corresponding: true }],
      venue: "Engineering with Computers",
      year: "2025",
      image: "/media/pub-shape-transformation-flow.png",
      selected: true,
      links: [{ label: "Paper", href: "https://doi.org/10.1007/s00366-025-02215-y" }]
    },
    {
      id: "P4",
      title: "Phase-field computation for 3D shell reconstruction with an energy-stable and uniquely solvable BDF2 method",
      authors: [{ name: "Dongting Cai" }, { name: "Boyi Fu" }, { name: "Renjun Gao" }, { name: "Xiangjie Kong" }, { name: "Junxiang Yang", corresponding: true }],
      venue: "Computers & Mathematics with Applications (CAMWA), vol. 189, pp. 1-23",
      year: "2025",
      image: "/media/pub-shell-bdf2.png",
      links: [{ label: "Paper", href: "https://doi.org/10.1016/j.camwa.2025.03.022" }]
    },
    {
      id: "P5",
      title: "On the numerical approximation of a phase-field volume reconstruction model: Linear and energy-stable leap-frog finite difference scheme",
      authors: [{ name: "Boyi Fu" }, { name: "Dongting Cai" }, { name: "Xiangjie Kong" }, { name: "Renjun Gao" }, { name: "Junxiang Yang", corresponding: true }],
      venue: "Communications in Nonlinear Science and Numerical Simulation (CNSNS), vol. 151, 109104",
      year: "2025",
      image: "/media/pub-leapfrog-reconstruction.png",
      links: [{ label: "Paper", href: "https://doi.org/10.1016/j.cnsns.2025.109104" }]
    },
    {
      id: "P6",
      title: "LC4-DViT: Land-cover Creation for Land-cover Classification with Deformable Vision Transformer",
      authors: [
        { name: "Kai Wang", equalContribution: true },
        { name: "Siyi Chen", equalContribution: true },
        { name: "Weicong Pang", equalContribution: true },
        { name: "Chenchen Zhang" }, { name: "Renjun Gao" }, { name: "Ziru Chen" },
        { name: "Cheng Li", corresponding: true }, { name: "Dasa Gu", corresponding: true },
        { name: "Rui Huang", corresponding: true }, { name: "Alexis Kai Hon Lau" }
      ],
      venue: "IEEE International Geoscience and Remote Sensing Symposium (IGARSS)",
      year: "2026",
      image: "/media/lc4dvit.png",
      selected: true,
      links: [
        { label: "Website", href: "https://charlescsyyy.github.io/LC4-DViT/" },
        { label: "Paper", href: "https://arxiv.org/pdf/2511.22812" },
        { label: "Code", href: "https://github.com/weicongpang/LC4-DViT" }
      ]
    },
    {
      id: "P7",
      title: "MVT: Mask-Grounded Vision-Language Models for Taxonomy-Aligned Land-Cover Tagging",
      authors: [
        { name: "Siyi Chen", equalContribution: true },
        { name: "Kai Wang", equalContribution: true },
        { name: "Weicong Pang", equalContribution: true },
        { name: "Ruiming Yang" }, { name: "Ziru Chen" }, { name: "Renjun Gao" },
        { name: "Alexis Kai Hon Lau" }, { name: "Dasa Gu", corresponding: true },
        { name: "Chenchen Zhang", corresponding: true }, { name: "Cheng Li", corresponding: true }
      ],
      venue: "IEEE International Geoscience and Remote Sensing Symposium (IGARSS)",
      year: "2026",
      image: "/media/mvt.png",
      selected: true,
      links: [
        { label: "Website", href: "https://charlescsyyy.github.io/MVT/" },
        { label: "Paper", href: "https://arxiv.org/pdf/2509.18693" },
        { label: "Code", href: "https://github.com/weicongpang/LandCover-MVT" }
      ]
    }
  ] satisfies Publication[],
  showcase: [
    {
      id: "lego-bus",
      title: "LEGO Technic Bus",
      summary: "A fully motorized, three-door Macau bus.",
      body:
        "A 1:20 Macau bus built from 4,000+ LEGO pieces, with rear drive, front steering, three inward-swinging doors, kneeling suspension, route sign replacement, and phone-based Bluetooth control.",
      image: "/media/hero-bus.jpg",
      detailImage: "/media/lego-bus-collage.png",
      video: "https://www.youtube.com/embed/_EOPROm5bpk?start=178",
      href: "https://www.youtube.com/watch?v=_EOPROm5bpk&t=178s"
    },
    {
      id: "wheel-legged-robot",
      title: "Wheel-Legged Robot",
      summary: "A five-link robot prototype built at Tsinghua AIR.",
      body: "A desktop five-link wheel-legged prototype built with LEGO frames, custom adapters, PCB integration, and closed-loop balance control.",
      image: "/media/project-wheel.png",
      imageFit: "contain",
      detailImage: "/media/wheel-robot.png"
    },
    {
      id: "dexterous-hand",
      title: "LEGO Dexterous Hand",
      summary: "A compact, modular hand for education and research.",
      body: "Brick But Agile is a compact anthropomorphic LEGO dexterous hand with detachable finger modules and tendon-driven actuation. The project explores accessible robotic hardware, visual teleoperation, and tool use.",
      image: "/media/project-hand.png",
      imageFit: "contain",
      detailImage: "/media/pub-brick-but-agile.png"
    }
  ] satisfies ShowcaseItem[],
  memberships: [
    {
      title: "乐构英雄会 / Heroes Club LUG",
      logo: "/media/logos/heroes-club-cutout.png",
      subtitle: "Recognized LEGO User Group, Shanghai",
      period: "Dec. 2022 - Present",
      links: [
        { label: "Website", href: "https://www.heroeslug.com/" },
        { label: "LEGO recognition", href: "https://lan.lego.com/clubs/21-heroes-club-lug-乐构英雄会lug/" }
      ],
      body:
        "Active member; built LEGO Technic structures including gearboxes, Ackermann steering systems, and automotive chassis."
    },
    {
      title: "福乐方块 / FULLBRICK LUG",
      logo: "/media/logos/fullbrick-transparent.png",
      subtitle: "Recognized LEGO User Group, Fujian",
      period: "Dec. 2021 - Present",
      links: [{ label: "LEGO community directory", href: "https://fancolab.lego.com/communities" }],
      body:
        "Active member and AFOL creator; participated in FULLBRICK events, festival exhibitions, and public STEM-facing LEGO communication."
    }
  ] satisfies Membership[],
  projectTracks: [
    {
      title: "Research workspace",
      body: "Papers, research projects, figures, code, and project logs."
    },
    {
      title: "Interactive systems",
      body: "Robotics, mechanisms, embedded systems, and Three.js-based public demos."
    },
    {
      title: "Writing archive",
      body: "Blog posts, research notes, design references, and long-form reflections."
    }
  ],
  designPrinciples: [
    { title: "Cinematic, but readable", icon: Sparkles },
    { title: "Academic, not resume-only", icon: PenTool },
    { title: "Physical systems as identity", icon: BusFront },
    { title: "Interactive layer, stable content", icon: Orbit }
  ],
  video: {
    title: "LEGO TECHNIC BUS MOC (KINGLONG KLQ6115GQ / Macau Bus 51A)",
    href: "https://www.youtube.com/watch?v=_EOPROm5bpk&t=178s",
    embed: "https://www.youtube.com/embed/_EOPROm5bpk?start=178",
    body:
      "The bus is the visual anchor of the site: an eight-month, 4,000+ piece all-LEGO Technic system with real mechanical functions and public AFOL festival validation."
  }
};

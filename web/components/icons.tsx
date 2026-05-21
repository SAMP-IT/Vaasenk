import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

const make = (path: React.ReactNode) =>
  function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg {...base} {...props}>
        {path}
      </svg>
    );
  };

export const IconArrowRight = make(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IconArrowUpRight = make(<path d="M7 17 17 7M8 7h9v9" />);
export const IconSparkle = make(
  <>
    <path d="M12 3l1.8 4.6L18 9.5l-4.2 1.9L12 16l-1.8-4.6L6 9.5l4.2-1.9L12 3z" />
    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
  </>,
);
export const IconBolt = make(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />);
export const IconBook = make(
  <>
    <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2V5z" />
    <path d="M8 7h7M8 11h6" />
  </>,
);
export const IconUpload = make(
  <>
    <path d="M21 15v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" />
    <path d="M17 8l-5-5-5 5M12 3v12" />
  </>,
);
export const IconChat = make(<path d="M21 12a8 8 0 0 1-12.4 6.7L3 21l1.6-5A8 8 0 1 1 21 12z" />);
export const IconHome = make(<path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2v-9z" />);
export const IconClassroom = make(
  <>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18M8 6V3M16 6V3" />
  </>,
);
export const IconBookmark = make(<path d="M6 3h12v18l-6-4-6 4V3z" />);
export const IconDownload = make(
  <>
    <path d="M21 15v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" />
    <path d="M7 10l5 5 5-5M12 15V3" />
  </>,
);
export const IconBell = make(
  <>
    <path d="M18 16V11a6 6 0 0 0-12 0v5l-2 3h16l-2-3z" />
    <path d="M9 19a3 3 0 0 0 6 0" />
  </>,
);
export const IconSettings = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1A1.7 1.7 0 0 0 10 4.1V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1A1.7 1.7 0 0 0 21 10.1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>,
);
export const IconUser = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
);
export const IconUsers = make(
  <>
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21a7 7 0 0 1 14 0" />
    <path d="M16 3.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-3-5.7" />
  </>,
);
export const IconFile = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
  </>,
);
export const IconShield = make(<path d="M12 2 4 6v6c0 5 4 9 8 10 4-1 8-5 8-10V6l-8-4z" />);
export const IconCheck = make(<path d="M5 12l5 5L20 7" />);
export const IconClose = make(<path d="M6 6l12 12M18 6 6 18" />);
export const IconChevron = make(<path d="M9 6l6 6-6 6" />);
export const IconSearch = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </>,
);
export const IconPlus = make(<path d="M12 5v14M5 12h14" />);
export const IconBars = make(<path d="M4 6h16M4 12h16M4 18h16" />);
export const IconLogo = make(
  <>
    <path d="M3 4l4.5 12L12 8l4.5 8L21 4" stroke="currentColor" strokeWidth="2.2" />
  </>,
);
export const IconCopy = make(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </>,
);
export const IconDoc = make(
  <>
    <path d="M7 3h9l4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M16 3v4h4M9 12h7M9 16h7" />
  </>,
);
export const IconRobot = make(
  <>
    <rect x="4" y="7" width="16" height="12" rx="2" />
    <path d="M9 13h.01M15 13h.01M12 3v4M8 19v2M16 19v2" />
  </>,
);
export const IconRefresh = make(
  <>
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M21 3v5h-5M3 21v-5h5" />
  </>,
);

import { Orbit } from "lucide-react";
import type { ReactNode } from "react";

import { SpaceIllustration } from "./space-illustration";
import styles from "./login-space.module.css";

interface SpaceAuthLayoutProps {
  platformName: string;
  title: string;
  description: string;
  entryLabel: string;
  announcement?: string;
  wide?: boolean;
  welcomeLabel?: string;
  children: ReactNode;
  bottomEntry?: ReactNode;
}

export function SpaceAuthLayout({
  platformName,
  title,
  description,
  entryLabel,
  announcement,
  wide = false,
  welcomeLabel = "WELCOME BACK",
  children,
  bottomEntry,
}: SpaceAuthLayoutProps) {
  return (
    <main className={`${styles.page} ${bottomEntry ? styles.scrollPage : ""}`}>
      <aside className={styles.universe} aria-label="学习探索">
        <SpaceIllustration />
        <svg
          aria-hidden="true"
          className={styles.waveEdge}
          viewBox="0 0 100 960"
          preserveAspectRatio="none"
          focusable="false"
        >
          <path
            d="M100 0H48c-56 90 45 123 4 213s-62 107-13 178-25 121-3 176 53 71 21 142-58 125 4 179l56 72Z"
            fill="#fff"
          />
        </svg>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <Orbit aria-hidden="true" size={25} strokeWidth={1.5} />
          </span>
          <div>
            <p className={styles.brandName}>{platformName}</p>
            <p className={styles.brandEnglish}>AI SMART LEARNING</p>
          </div>
        </div>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>STAY CURIOUS. KEEP EXPLORING.</span>
          <h2>
            让好奇心，
            <br />
            抵达新的星球。
          </h2>
          <p>
            每一个问题，都是探索的起点。
            <br />
            在这里，发现属于你的学习宇宙。
          </p>
        </div>
        <p className={styles.artCaption}>YOUR NEXT DISCOVERY STARTS HERE</p>
      </aside>
      <section className={styles.content} aria-labelledby="login-heading">
        <p className={styles.topline}>{entryLabel}</p>
        <div className={`${styles.formPanel} ${wide ? styles.widePanel : ""}`}>
          <p className={styles.welcome}>{welcomeLabel}</p>
          <h1 className={styles.heading} id="login-heading">
            {title}
          </h1>
          <p className={styles.description}>{description}</p>
          {announcement ? (
            <p className={styles.announcement}>{announcement}</p>
          ) : null}
          {children}
        </div>
        {bottomEntry ? (
          <div className={styles.afterFold}>{bottomEntry}</div>
        ) : null}
        <p className={styles.footer}>用知识连接未来 · {platformName}</p>
      </section>
    </main>
  );
}

"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Building2,
  Globe2,
  GraduationCap,
  MapPin,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
} from "lucide-react";
import { ChinaMap } from "./china-map";
import type { ApplicationShowcaseData } from "@/services/super-admin/showcase";
import styles from "./showcase.module.css";

const format = (count: number) => count.toLocaleString("zh-CN");

export function ApplicationShowcase({
  data,
}: {
  data: ApplicationShowcaseData;
}) {
  const root = useRef<HTMLElement>(null);
  const mapPanelRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(data.ranking[0]?.code ?? "320000");
  const [hovered, setHovered] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failedLogoUrls, setFailedLogoUrls] = useState<Set<string>>(
    () => new Set(),
  );
  const province = data.provinces.find((item) => item.code === selected);
  const regionName =
    selected === "unlocated" ? "待完善地区" : (province?.name ?? "请选择省份");
  const schools =
    selected === "unlocated" ? data.unlocated : (province?.schools ?? []);
  const visibleSchools = schools.filter((school) =>
    school.name
      .toLocaleLowerCase("zh-CN")
      .includes(keyword.trim().toLocaleLowerCase("zh-CN")),
  );
  const hoverProvince = data.provinces.find((item) => item.code === hovered);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        data.provinces.map((item) => [item.code, item.schools.length]),
      ),
    [data.provinces],
  );
  const updatedAt = new Date(data.generatedAt).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });

  useEffect(() => {
    const update = () =>
      setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    const mapPanel = mapPanelRef.current;
    const sidebar = sidebarRef.current;
    if (!mapPanel || !sidebar) return;

    const syncSidebarHeight = () => {
      if (window.matchMedia("(max-width: 1100px)").matches) {
        sidebar.style.removeProperty("--showcase-sidebar-max-height");
        return;
      }
      sidebar.style.setProperty(
        "--showcase-sidebar-max-height",
        `${Math.round(mapPanel.getBoundingClientRect().height)}px`,
      );
    };
    const observer = new ResizeObserver(syncSidebarHeight);
    observer.observe(mapPanel);
    window.addEventListener("resize", syncSidebarHeight);
    syncSidebarHeight();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncSidebarHeight);
    };
  }, [fullscreen]);

  function selectProvince(code: string) {
    setSelected(code);
    setKeyword("");
  }
  async function toggleFullscreen() {
    setFeedback("");
    try {
      if (document.fullscreenElement === root.current)
        await document.exitFullscreen();
      else if (root.current?.requestFullscreen)
        await root.current.requestFullscreen();
      else setFeedback("当前浏览器不支持此全屏方式，可使用浏览器的全屏功能。");
    } catch {
      setFeedback("暂时无法进入全屏，请使用浏览器的全屏功能。");
    }
  }

  return (
    <section
      ref={root}
      className={styles.screen}
      aria-labelledby="showcase-title"
    >
      <header className={styles.header}>
        <div>
          <p className={styles.overline}>智慧教育</p>
          <h1 id="showcase-title">系统应用情况</h1>
          <p className={styles.subtitle}>
            全国高校接入情况，点击省份查看学校。
          </p>
        </div>
        <div className={styles.actions}>
          <button
            onClick={() => startTransition(() => router.refresh())}
            type="button"
            disabled={pending}
            aria-busy={pending}
            title="刷新学校应用数据"
          >
            <RefreshCw
              className={`size-4 ${pending ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {pending ? "刷新中" : "刷新"}
          </button>
          <button
            onClick={toggleFullscreen}
            type="button"
            aria-label={fullscreen ? "退出全屏展示" : "进入全屏展示"}
          >
            {fullscreen ? (
              <Minimize2 className="size-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="size-4" aria-hidden="true" />
            )}
            {fullscreen ? "退出全屏" : "全屏展示"}
          </button>
        </div>
      </header>
      {feedback ? (
        <p className={styles.feedback} role="status">
          {feedback}
        </p>
      ) : null}
      <div className={styles.metrics}>
        {[
          {
            label: "接入高校",
            value: data.totalSchools,
            unit: "所",
            icon: Building2,
            note: "已接入系统的高校",
          },
          {
            label: "覆盖地区",
            value: data.coveredProvinces,
            unit: "/ 34",
            icon: Globe2,
            note: "全国 34 个省级地区",
          },
          {
            label: "师生账号",
            value: data.totalLearners,
            unit: "人",
            icon: GraduationCap,
            note: "接入高校的教师与学生",
          },
        ].map(({ label, value, unit, icon: Icon, note }) => (
          <article className={styles.metric} key={label}>
            <div>
              <p>{label}</p>
              <strong>
                {format(value)}
                <span>{unit}</span>
              </strong>
              <small>{note}</small>
            </div>
            <Icon aria-hidden="true" />
          </article>
        ))}
      </div>

      <div className={styles.content}>
        <section
          ref={mapPanelRef}
          className={styles.mapPanel}
          aria-label="全国省份高校分布"
        >
          <div className={styles.panelHeading}>
            <div>
              <h2>高校分布</h2>
            </div>
            <p>按接入高校数量着色</p>
          </div>
          <div className={styles.mapArea}>
            <div className={styles.mapHint} aria-live="polite">
              <MapPin className="size-4" aria-hidden="true" />
              <span>{hoverProvince?.name ?? regionName}</span>
              <strong>
                {hoverProvince?.schools.length ?? schools.length}
                <small> 所高校</small>
              </strong>
            </div>
            <ChinaMap
              counts={counts}
              maxCount={data.maxCount}
              selected={selected}
              hovered={hovered}
              onSelect={selectProvince}
              onHover={setHovered}
            />
          </div>
          <div className={styles.legend}>
            <span>使用高校数量</span>
            <span>0</span>
            <div />
            <span>{data.maxCount}</span>
            <small>颜色越深，接入高校越多</small>
          </div>
          <p className={styles.mapSource}>
            地图数据：
            <a
              href="https://datav.aliyun.com/portal/school/atlas/area_selector"
              target="_blank"
              rel="noreferrer"
            >
              DataV.GeoAtlas
            </a>
          </p>
        </section>

        <aside ref={sidebarRef} className={styles.sidebar}>
          <section
            className={styles.detailPanel}
            aria-labelledby="selected-province-title"
          >
            <div className={styles.panelHeading}>
              <div>
                <h2>接入高校</h2>
              </div>
            </div>
            <label htmlFor="showcase-province" className="sr-only">
              选择省级地区
            </label>
            <select
              id="showcase-province"
              className={styles.provinceSelect}
              value={selected}
              onChange={(event) => selectProvince(event.target.value)}
            >
              {data.provinces.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name} · {item.schools.length} 所
                </option>
              ))}
              {data.unlocated.length > 0 ? (
                <option value="unlocated">
                  待完善地区 · {data.unlocated.length} 所
                </option>
              ) : null}
            </select>
            <div className={styles.provinceSummary} aria-live="polite">
              <div>
                <p>所选地区</p>
                <h3 id="selected-province-title">{regionName}</h3>
              </div>
              <strong>
                {schools.length}
                <span> 所高校</span>
              </strong>
            </div>
            {schools.length > 5 ? (
              <div className={styles.search}>
                <Search className="size-4" aria-hidden="true" />
                <input
                  aria-label="搜索当前省份高校"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索高校名称"
                />
              </div>
            ) : null}
            <div className={styles.schoolList}>
              {visibleSchools.map((school) => {
                const logoUrl = school.logoUrl;
                return (
                  <article key={school.id} className={styles.schoolCard}>
                    {logoUrl && !failedLogoUrls.has(logoUrl) ? (
                      <Image
                        alt={`${school.name}校徽`}
                        className={styles.schoolLogo}
                        height={32}
                        onError={() =>
                          setFailedLogoUrls((current) =>
                            new Set(current).add(logoUrl),
                          )
                        }
                        src={logoUrl}
                        unoptimized
                        width={32}
                      />
                    ) : (
                      <Building2
                        className={styles.schoolIcon}
                        aria-hidden="true"
                      />
                    )}
                    <div>
                      <h4>{school.name}</h4>
                      <p>
                        <span className={styles.connectedDot} /> 已接入
                        <span>·</span>师生账号 {format(school.learners)}
                      </p>
                      <small>
                        {new Date(school.joinedAt).toLocaleDateString("zh-CN", {
                          timeZone: "Asia/Shanghai",
                        })}{" "}
                        接入
                      </small>
                    </div>
                  </article>
                );
              })}
              {visibleSchools.length === 0 ? (
                <div className={styles.empty}>
                  <Building2 aria-hidden="true" />
                  <p>{keyword ? "没有匹配的高校" : "暂无接入高校"}</p>
                  <small>
                    {keyword
                      ? "请尝试其他关键词。"
                      : selected === "unlocated"
                        ? "所有接入高校均已设置地区。"
                        : "该地区暂无已接入高校。"}
                  </small>
                </div>
              ) : null}
            </div>
          </section>
          <section
            className={styles.rankingPanel}
            aria-labelledby="showcase-ranking-title"
          >
            <div className={styles.panelHeading}>
              <div>
                <h2 id="showcase-ranking-title">各省接入数量</h2>
              </div>
              <span className={styles.rankingTag}>前 6 名</span>
            </div>
            {data.ranking.slice(0, 6).map((item, index) => (
              <button
                className={styles.rankRow}
                key={item.code}
                type="button"
                onClick={() => selectProvince(item.code)}
                aria-pressed={selected === item.code}
              >
                <span>{index + 1}</span>
                <div>
                  <p>
                    {item.shortName}
                    <strong>
                      {item.schools.length}
                      <small> 所</small>
                    </strong>
                  </p>
                  <div className={styles.rankTrack}>
                    <div
                      style={{
                        width: `${(item.schools.length / data.maxCount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </button>
            ))}
            {data.ranking.length === 0 ? (
              <p className={styles.noRanking}>暂无已标注地区的接入高校。</p>
            ) : null}
          </section>
        </aside>
      </div>
      <footer className={styles.footer}>
        <p>
          山水底图：
          <a
            href="https://asia-archive.si.edu/object/F1909.197/"
            target="_blank"
            rel="noreferrer"
          >
            Smithsonian · Misty Mountains（CC0）
          </a>
        </p>
        <p>
          统计范围：已绑定高校管理员的学校，每校计一次。
          {data.unlocated.length > 0 ? (
            <button type="button" onClick={() => selectProvince("unlocated")}>
              {data.unlocated.length} 所高校待完善地区
            </button>
          ) : null}
        </p>
        <time dateTime={data.generatedAt}>更新于 {updatedAt} · 北京时间</time>
      </footer>
    </section>
  );
}

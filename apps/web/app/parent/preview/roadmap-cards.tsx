"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Tabs } from "radix-ui";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { subjectRoadmaps } from "@/lib/parent/curriculum";

const ICON: Record<string, string> = {
  numbers: "home-imgImage18Vectorized",
  shapes: "home-imgMastery1",
  remembering: "home-imgInsights1",
  choosing: "home-imgRoadmap1",
  words: "home-imgImage19Vectorized",
  stories: "home-imgPuzzledSmileyStreamlineFlex1Vectorized",
  "joining-in": "home-imgTv1",
  "show-spanish": "home-imgMastery1",
};
/* eslint-disable @next/next/no-img-element -- Exact local Figma artwork. */

type Subject = ReturnType<typeof subjectRoadmaps>[number];

export function RoadmapCards({ subjects }: { subjects: Subject[] }) {
  const [selected, setSelected] = useState(subjects[0]?.id ?? "");
  const [direction, setDirection] = useState("next");
  const [keyboard, setKeyboard] = useState(false);
  const thumbnails = useRef<HTMLDivElement>(null);
  const index = Math.max(
    0,
    subjects.findIndex((subject) => subject.id === selected),
  );

  const activeId = subjects[index]?.id ?? "";

  useEffect(() => {
    const strip = thumbnails.current;
    const active = strip?.querySelector<HTMLElement>('[data-state="active"]');
    if (!strip || !active) return;

    // Reveal only within the strip; scrollIntoView would also move the page.
    const stripBounds = strip.getBoundingClientRect();
    const activeBounds = active.getBoundingClientRect();
    const overflow =
      activeBounds.left < stripBounds.left
        ? activeBounds.left - stripBounds.left - 4
        : activeBounds.right > stripBounds.right
          ? activeBounds.right - stripBounds.right + 4
          : 0;
    if (overflow) {
      strip.scrollTo({ left: strip.scrollLeft + overflow, behavior: "instant" });
    }
  }, [activeId, subjects]);

  function select(value: string) {
    setDirection(
      subjects.findIndex((subject) => subject.id === value) < index
        ? "previous"
        : "next",
    );
    setSelected(value);
  }

  function handleThumbnailKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const current = tabs.findIndex((tab) => tab === event.target);
    if (current < 0) return;
    let next: number;
    switch (event.key) {
      case "ArrowLeft":
        next = (current - 1 + tabs.length) % tabs.length;
        break;
      case "ArrowRight":
        next = (current + 1) % tabs.length;
        break;
      case "Home":
      case "PageUp":
        next = 0;
        break;
      case "End":
      case "PageDown":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    // Keep Radix's focus-to-select behavior, without its page-scrolling focus.
    event.preventDefault();
    tabs[next]?.focus({ preventScroll: true });
  }

  if (!subjects.length)
    return <p className="roadmap-note">No roadmaps available yet.</p>;

  return (
    <Tabs.Root
      value={activeId}
      onValueChange={select}
      className="roadmap-browser"
      data-keyboard={keyboard}
      data-direction={direction}
      onKeyDownCapture={() => setKeyboard(true)}
      onPointerDownCapture={() => setKeyboard(false)}
    >
      <Tabs.List
        ref={thumbnails}
        className="roadmap-thumbnails"
        aria-label="Learning roadmaps"
        onKeyDownCapture={handleThumbnailKeyDown}
        loop
      >
        {subjects.map((subject) => (
          <Tabs.Trigger
            key={subject.id}
            value={subject.id}
            className="roadmap-choice"
          >
            <span className="roadmap-choice-icon">
              <img src={`/figma/${ICON[subject.id]}.svg`} alt="" />
            </span>
            <span className="roadmap-choice-name">{subject.name}</span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <div className="roadmap-stage">
        <div className="roadmap-navigation">
          <button
            type="button"
            aria-label="Previous roadmap"
            disabled={index === 0}
            onClick={() => select(subjects[index - 1]!.id)}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next roadmap"
            disabled={index === subjects.length - 1}
            onClick={() => select(subjects[index + 1]!.id)}
          >
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="roadmap-panel-viewport">
          {subjects.map((subject) => (
            <Tabs.Content
              key={subject.id}
              value={subject.id}
              className="roadmap-panel"
            >
              <Card className="roadmap-subject">
                <header>
                  <div>
                    <h3>{subject.name}</h3>
                  </div>
                  <span>
                    {subject.nodes.filter((n) => n.state === "complete").length}{" "}
                    of {subject.nodes.length} checkpoints at mastery
                  </span>
                </header>
                <div
                  className="roadmap-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label={`Scroll ${subject.name} checkpoints vertically`}
                >
                  <div
                    className="roadmap-course"
                    style={{ height: subject.nodes.length * 240 + 90 }}
                  >
                    <svg className="roadmap-path" aria-hidden="true">
                      {subject.nodes.slice(0, -1).map((node, n) => (
                        <line
                          key={node.id}
                          x1={n % 2 ? "72%" : "28%"}
                          y1={n * 240 + 183}
                          x2={n % 2 ? "28%" : "72%"}
                          y2={(n + 1) * 240 + 183}
                          stroke={
                            node.state === "complete" ? "#ffe436" : "#b7bec850"
                          }
                          strokeWidth="35"
                        />
                      ))}
                    </svg>
                    <div className="roadmap-ruler" aria-hidden="true">
                      {subject.nodes.map((node) => (
                        <span
                          key={node.id}
                          style={{ top: (node.checkpoint / 10) * 240 + 130 }}
                        >
                          {node.checkpoint}
                          <i />
                        </span>
                      ))}
                    </div>
                    {subject.nodes.map(
                      (node, n) =>
                        (n === 0 || node.band !== subject.nodes[n - 1]?.band) && (
                          <div
                            key={node.id}
                            className="roadmap-grade-divider"
                            style={{ top: n * 240 + 15 }}
                          >
                            <span>{node.band}</span>
                          </div>
                        ),
                    )}
                    {subject.nodes.map((node, n) => (
                      <div
                        className="roadmap-checkpoint"
                        data-state={node.state}
                        key={node.id}
                        style={{ left: n % 2 ? "72%" : "28%", top: n * 240 + 58 }}
                      >
                        <p className="roadmap-grade">{node.band}</p>
                        <div className="roadmap-token">
                          {subject.id === "numbers" ? (
                            <img
                              className="roadmap-math"
                              src={`/figma/roadmap-imgFrame${node.state === "locked" || node.state === "planned" ? "86" : "84"}.svg`}
                              alt=""
                            />
                          ) : (
                            <>
                              <img
                                className="roadmap-hex"
                                src="/figma/roadmap-imgPolygon2.svg"
                                alt=""
                              />
                              <span className="roadmap-topic-icon">
                                <img
                                  src={`/figma/${ICON[subject.id]}.svg`}
                                  alt=""
                                />
                              </span>
                            </>
                          )}
                          {(node.state === "locked" ||
                            node.state === "planned") &&
                            subject.id !== "numbers" && (
                              <img
                                className="roadmap-lock"
                                src="/figma/roadmap-lock.svg"
                                alt=""
                              />
                            )}
                          {node.state === "complete" && (
                            <span
                              className="roadmap-complete"
                              aria-label="Mastery"
                            >
                              ✓
                            </span>
                          )}
                        </div>
                        <h4>{node.name}</h4>
                        <p className="roadmap-status">
                          {node.state === "complete"
                            ? "Mastery"
                            : node.state === "planned"
                              ? "Planned lesson"
                              : node.state === "locked"
                                ? "Locked · earlier checkpoint first"
                                : node.asked
                                  ? `${node.asked} saved attempts · practising`
                                  : "Start here"}
                        </p>
                        <small>
                          {node.lessonIds.length
                            ? `${node.lessonIds.length} prepared Dora moments`
                            : "New teaching moment needed"}
                        </small>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </Tabs.Content>
          ))}
        </div>
      </div>
    </Tabs.Root>
  );
}

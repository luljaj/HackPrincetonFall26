"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Tabs } from "radix-ui";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { subjectRoadmaps } from "@/lib/parent/curriculum";
import { RoadmapToken, TOKEN_COLOR } from "./roadmap-token";

// Flat duotone subject icons (flat-duotone-icons skill), one per roadmap subject.
const ICON_IDS = ["numbers", "shapes", "remembering", "choosing", "words", "stories", "joining-in", "show-spanish"];
const icon = (id: string) => `/icons/subject-${ICON_IDS.includes(id) ? id : "numbers"}.svg`;
// Vertical distance between checkpoints; neighbours sit in alternate columns, so they can overlap in height.
const STEP = 170;
const tokenIcon = (id: string) => `/icons/subject-${ICON_IDS.includes(id) ? id : "numbers"}-token.svg`;
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
              <img src={icon(subject.id)} alt="" />
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
                    style={{ height: subject.nodes.length * STEP + 160 }}
                  >
                    <svg className="roadmap-path" aria-hidden="true">
                      {subject.nodes.slice(0, -1).map((node, n) => {
                        const next = subject.nodes[n + 1]!;
                        const ahead = next.state === "locked" || next.state === "planned";
                        const fromLeft = n % 2 === 0;
                        const line = { x1: fromLeft ? "28%" : "72%", y1: n * STEP + 160, x2: fromLeft ? "72%" : "28%", y2: (n + 1) * STEP + 160 };
                        const g = `band-${node.id}`;
                        return (
                          <g key={node.id}>
                            <defs>
                              <linearGradient id={g} x1={fromLeft ? 0 : 1} x2={fromLeft ? 1 : 0} y1="0" y2="0">
                                <stop offset="0" stopColor={ahead ? "#C9CBD1" : TOKEN_COLOR[next.state]} stopOpacity="0" />
                                <stop offset=".75" stopColor={ahead ? "#C9CBD1" : TOKEN_COLOR[next.state]} stopOpacity={ahead ? 0.35 : 0.85} />
                              </linearGradient>
                            </defs>
                            <line {...line} stroke={`url(#${g})`} strokeWidth="46" />
                            {ahead && <line {...line} stroke="#D3D5DC" strokeWidth="9" strokeLinecap="round" strokeDasharray="0 22" />}
                          </g>
                        );
                      })}
                    </svg>
                    <div className="roadmap-ruler" aria-hidden="true">
                      {subject.nodes.map((node) => (
                        <span
                          key={node.id}
                          style={{ top: (node.checkpoint / 10) * STEP + 130 }}
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
                            style={{ top: n * STEP + 15 }}
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
                        style={{ left: n % 2 ? "72%" : "28%", top: n * STEP + 58 }}
                      >
                        <p className="roadmap-grade">{node.band}</p>
                        <RoadmapToken id={node.id} state={node.state} icon={tokenIcon(subject.id)} />
                        {node.state === "complete" && (
                          <span className="roadmap-complete" aria-label="Mastery">
                            ✓
                          </span>
                        )}
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

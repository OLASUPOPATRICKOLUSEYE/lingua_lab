"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudentMissionCard } from "@/components/student/StudentMissionCard";
import type { StudentAssignment } from "@/utils/student/assignments";

const VISIBLE_CARD_COUNT = 2;
const SWIPE_THRESHOLD_PX = 56;

export function StudentMissionCarousel({
  assignments,
}: {
  assignments: StudentAssignment[];
}) {
  const [startIndex, setStartIndex] = useState(0);
  const [stepWidth, setStepWidth] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const maxStartIndex = Math.max(0, assignments.length - VISIBLE_CARD_COUNT);

  function showPrevious() {
    setStartIndex((current) => Math.max(0, current - 1));
  }

  function showNext() {
    setStartIndex((current) => Math.min(maxStartIndex, current + 1));
  }

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const updateStepWidth = () => {
      const firstCard = track.children.item(0) as HTMLElement | null;
      const nextCard = track.children.item(1) as HTMLElement | null;
      if (!firstCard) {
        setStepWidth(0);
        return;
      }

      if (nextCard) {
        setStepWidth(nextCard.offsetLeft - firstCard.offsetLeft);
        return;
      }

      setStepWidth(firstCard.offsetWidth);
    };

    updateStepWidth();

    const observer = new ResizeObserver(() => {
      updateStepWidth();
    });
    observer.observe(track);
    Array.from(track.children).forEach((child) => observer.observe(child));

    return () => observer.disconnect();
  }, [assignments.length]);

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (assignments.length <= VISIBLE_CARD_COUNT) return;
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
    setIsDragging(true);
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (touchStartXRef.current === null || stepWidth <= 0) return;
    const currentX = event.touches[0]?.clientX;
    if (typeof currentX !== "number") return;

    const maxDrag = Math.min(stepWidth * 0.35, 120);
    const nextOffset = Math.max(
      -maxDrag,
      Math.min(maxDrag, currentX - touchStartXRef.current),
    );
    setDragOffset(nextOffset);
  }

  function handleTouchEnd() {
    if (touchStartXRef.current === null) return;

    if (dragOffset <= -SWIPE_THRESHOLD_PX) {
      showNext();
    } else if (dragOffset >= SWIPE_THRESHOLD_PX) {
      showPrevious();
    }

    touchStartXRef.current = null;
    setDragOffset(0);
    setIsDragging(false);
  }

  return (
    <div className="space-y-3">
      {assignments.length > VISIBLE_CARD_COUNT ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-[0.82rem]">
            Showing {startIndex + 1}-{Math.min(startIndex + VISIBLE_CARD_COUNT, assignments.length)} of{" "}
            {assignments.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={showPrevious}
              disabled={startIndex === 0}
              aria-label="Show previous passages"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={showNext}
              disabled={startIndex >= maxStartIndex}
              aria-label="Show next passages"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden">
        <div
          ref={trackRef}
          className={`flex gap-3 ${isDragging ? "transition-none" : "transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"}`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          style={{
            transform: `translateX(-${Math.min(
              maxStartIndex * stepWidth,
              Math.max(0, startIndex * stepWidth - dragOffset),
            )}px)`,
          }}
        >
          {assignments.map((assignment) => (
            <div
              key={assignment.id}
              className="min-w-0 shrink-0 basis-full sm:basis-[calc(50%-0.375rem)]"
            >
              <StudentMissionCard assignment={assignment} compact />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

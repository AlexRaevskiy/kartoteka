/**
 * Study modes shown on the deck page, in the study menu and on the Intro end screen.
 * Labels: modes.<id>.label / modes.<id>.hint in the locale files.
 * minCards: the mode needs other cards (wrong options / fake translations / pairs);
 * with fewer cards StudyScreen falls back to flashcards.
 * Kept apart from StudyScreen.jsx so Intro and the screens can import it without a cycle.
 */
import { GraduationCap, Grid3x3, Layers, ListChecks, PenLine, Zap } from "lucide-react";

export const MODES = [
  { id: "flashcards", icon: Layers },
  { id: "learn", icon: GraduationCap },
  { id: "quiz", icon: ListChecks, minCards: 2 },
  { id: "write", icon: PenLine },
  { id: "match", icon: Grid3x3, minCards: 2 },
  { id: "blitz", icon: Zap, minCards: 2 },
];

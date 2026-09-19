import type { Session } from "./session";

// Achievements are derived from the save, never stored, so they cannot drift.
// Every predicate reads only monotonic progress (levels, stars, streaks), which
// is why an achievement can never be re-locked by playing on.

export function totalStars(session: Session): number {
  return Object.values(session.stars).reduce((sum, stars) => sum + stars, 0);
}

export function perfectLevels(session: Session): number {
  return Object.values(session.stars).filter((stars) => stars === 3).length;
}

export type Achievement = {
  id: string;
  label: string;
  description: string;
  earned: (session: Session) => boolean;
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-steps", label: "First steps", description: "Clear level 1.",
    earned: (session) => session.rewardedThrough >= 1 },
  { id: "full-chapter", label: "Full chapter", description: "Clear all 20 levels of a chapter.",
    earned: (session) => session.rewardedThrough >= 20 },
  { id: "explorer", label: "Wandering explorer", description: "Clear 50 levels.",
    earned: (session) => session.rewardedThrough >= 50 },
  { id: "constellation", label: "Constellation", description: "Collect 30 stars.",
    earned: (session) => totalStars(session) >= 30 },
  { id: "flawless", label: "Flawless five", description: "Earn three stars on five levels.",
    earned: (session) => perfectLevels(session) >= 5 },
  { id: "daily-visitor", label: "Daily visitor", description: "Finish your first daily puzzle.",
    earned: (session) => session.dailiesCleared >= 1 },
  { id: "streak-three", label: "Three in a row", description: "Reach a 3-day daily streak.",
    earned: (session) => session.dailyBestStreak >= 3 },
  { id: "streak-seven", label: "A week of cozy", description: "Reach a 7-day daily streak.",
    earned: (session) => session.dailyBestStreak >= 7 },
];

export function earnedAchievements(session: Session): Achievement[] {
  return ACHIEVEMENTS.filter((achievement) => achievement.earned(session));
}

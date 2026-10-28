import type { Exercise } from '../types';

// Functional, low-machine library: ropes, dumbbells, kettlebells, balls, bodyweight.
export const EXERCISES: Exercise[] = [
  // Cardio / conditioning
  { id: 'rope-waves', name: 'Battle rope waves', type: 'cardio', pattern: 'conditioning', equipment: ['ropes'], measure: 'time', sec: 40, avoidFor: [], focus: ['upper', 'full'] },
  { id: 'rope-slams', name: 'Battle rope slams', type: 'cardio', pattern: 'conditioning', equipment: ['ropes'], measure: 'time', sec: 40, avoidFor: ['shoulder'], focus: ['upper', 'full'] },
  { id: 'rope-sprints', name: 'Rope sprints (fast waves)', type: 'cardio', pattern: 'conditioning', equipment: ['ropes'], measure: 'time', sec: 45, avoidFor: [], focus: ['upper', 'full'] },
  { id: 'mountain-climbers', name: 'Mountain climbers', type: 'cardio', pattern: 'conditioning', equipment: ['bodyweight'], measure: 'time', sec: 30, avoidFor: ['wrist'], focus: ['full', 'lower'] },
  { id: 'incline-climbers', name: 'Incline mountain climbers (hands on bench)', type: 'cardio', pattern: 'conditioning', equipment: ['bodyweight', 'box'], measure: 'time', sec: 30, avoidFor: [], focus: ['full', 'lower'] },
  { id: 'jumping-jacks', name: 'Jumping jacks', type: 'cardio', pattern: 'conditioning', equipment: ['bodyweight'], measure: 'time', sec: 45, avoidFor: ['knee'], focus: ['full', 'upper'] },
  { id: 'step-jacks', name: 'Step jacks (low impact)', type: 'cardio', pattern: 'conditioning', equipment: ['bodyweight'], measure: 'time', sec: 45, avoidFor: [], focus: ['full', 'upper'] },
  { id: 'medball-slam', name: 'Med-ball slam', type: 'cardio', pattern: 'conditioning', equipment: ['med-ball'], measure: 'reps', reps: 12, loadLb: 10, loadStep: 2, avoidFor: ['back'], focus: ['full', 'upper'] },
  { id: 'medball-chest-pass', name: 'Med-ball chest pass (wall)', type: 'cardio', pattern: 'push', equipment: ['med-ball'], measure: 'reps', reps: 15, loadLb: 8, loadStep: 2, avoidFor: [], focus: ['upper', 'full'] },
  { id: 'skater-hops', name: 'Skater hops', type: 'cardio', pattern: 'conditioning', equipment: ['bodyweight'], measure: 'time', sec: 30, avoidFor: ['knee'], focus: ['lower', 'full'] },
  { id: 'high-knees', name: 'High knees', type: 'cardio', pattern: 'conditioning', equipment: ['bodyweight'], measure: 'time', sec: 30, avoidFor: ['knee'], focus: ['lower', 'full'] },
  { id: 'march-fast', name: 'Fast marching with arm drive', type: 'cardio', pattern: 'conditioning', equipment: ['bodyweight'], measure: 'time', sec: 40, avoidFor: [], focus: ['lower', 'full'] },
  { id: 'kb-swing', name: 'Kettlebell swing', type: 'cardio', pattern: 'hinge', equipment: ['kettlebell'], measure: 'reps', reps: 15, loadLb: 25, loadStep: 5, avoidFor: ['back'], focus: ['lower', 'full'] },

  // Lower strength
  { id: 'goblet-squat', name: 'Goblet squat', type: 'strength', pattern: 'squat', equipment: ['dumbbells'], measure: 'reps', reps: 12, loadLb: 25, loadStep: 5, avoidFor: [], focus: ['lower', 'full'], tempoVariant: 'tempo-goblet-squat' },
  { id: 'tempo-goblet-squat', name: 'Tempo goblet squat (3 s down)', type: 'strength', pattern: 'squat', equipment: ['dumbbells'], measure: 'reps', reps: 10, loadLb: 20, loadStep: 5, avoidFor: [], focus: ['lower', 'full'] },
  { id: 'ball-wall-squat', name: 'Stability-ball wall squat', type: 'strength', pattern: 'squat', equipment: ['stability-ball', 'dumbbells'], measure: 'reps', reps: 12, loadLb: 15, loadStep: 5, avoidFor: [], focus: ['lower'] },
  { id: 'walking-lunge', name: 'Walking lunges', type: 'strength', pattern: 'lunge', equipment: ['dumbbells'], measure: 'reps', reps: 10, perSide: true, loadLb: 15, loadStep: 5, avoidFor: ['knee'], focus: ['lower', 'full'] },
  { id: 'reverse-lunge', name: 'Reverse lunge', type: 'strength', pattern: 'lunge', equipment: ['dumbbells'], measure: 'reps', reps: 10, perSide: true, loadLb: 15, loadStep: 5, avoidFor: ['knee'], focus: ['lower'] },
  { id: 'step-up', name: 'Step-up, low box', type: 'strength', pattern: 'lunge', equipment: ['box', 'bodyweight'], measure: 'reps', reps: 10, perSide: true, loadLb: 0, loadStep: 5, avoidFor: [], focus: ['lower', 'full'] },
  { id: 'kb-deadlift', name: 'Kettlebell deadlift', type: 'strength', pattern: 'hinge', equipment: ['kettlebell'], measure: 'reps', reps: 12, loadLb: 35, loadStep: 5, avoidFor: [], focus: ['lower', 'full'], tempoVariant: 'kb-deadlift-pause' },
  { id: 'kb-deadlift-pause', name: 'Kettlebell deadlift (pause at knee)', type: 'strength', pattern: 'hinge', equipment: ['kettlebell'], measure: 'reps', reps: 10, loadLb: 30, loadStep: 5, avoidFor: [], focus: ['lower'] },
  { id: 'db-rdl', name: 'Dumbbell Romanian deadlift', type: 'strength', pattern: 'hinge', equipment: ['dumbbells'], measure: 'reps', reps: 10, loadLb: 20, loadStep: 5, avoidFor: ['back'], focus: ['lower'] },
  { id: 'glute-bridge', name: 'Glute bridge', type: 'strength', pattern: 'hinge', equipment: ['bodyweight'], measure: 'reps', reps: 15, loadLb: 0, loadStep: 10, avoidFor: [], focus: ['lower'] },

  // Upper strength
  { id: 'db-push-press', name: 'DB push press', type: 'strength', pattern: 'push', equipment: ['dumbbells'], measure: 'reps', reps: 10, loadLb: 15, loadStep: 5, avoidFor: ['shoulder'], focus: ['upper', 'full'] },
  { id: 'db-floor-press', name: 'DB floor press', type: 'strength', pattern: 'push', equipment: ['dumbbells'], measure: 'reps', reps: 10, loadLb: 20, loadStep: 5, avoidFor: [], focus: ['upper'] },
  { id: 'ball-pushup', name: 'Push-up, hands on stability ball', type: 'strength', pattern: 'push', equipment: ['stability-ball'], measure: 'reps', reps: 10, avoidFor: ['wrist', 'shoulder'], focus: ['upper', 'full'] },
  { id: 'incline-pushup', name: 'Incline push-up (bench)', type: 'strength', pattern: 'push', equipment: ['box', 'bodyweight'], measure: 'reps', reps: 12, avoidFor: [], focus: ['upper', 'full'] },
  { id: 'renegade-row', name: 'Renegade row', type: 'strength', pattern: 'pull', equipment: ['dumbbells'], measure: 'reps', reps: 8, perSide: true, loadLb: 15, loadStep: 5, avoidFor: ['wrist'], focus: ['upper', 'full'] },
  { id: 'db-row', name: 'Bent-over DB row', type: 'strength', pattern: 'pull', equipment: ['dumbbells'], measure: 'reps', reps: 10, loadLb: 20, loadStep: 5, avoidFor: ['back'], focus: ['upper'] },
  { id: 'ball-chest-row', name: 'Chest-supported row (on ball)', type: 'strength', pattern: 'pull', equipment: ['stability-ball', 'dumbbells'], measure: 'reps', reps: 10, loadLb: 15, loadStep: 5, avoidFor: [], focus: ['upper'] },
  { id: 'farmer-carry', name: "Farmer's carry", type: 'strength', pattern: 'carry', equipment: ['dumbbells', 'kettlebell'], measure: 'time', sec: 40, loadLb: 30, loadStep: 5, avoidFor: [], focus: ['full', 'upper'] },

  // Core
  { id: 'plank', name: 'Plank', type: 'core', pattern: 'core', equipment: ['bodyweight'], measure: 'time', sec: 40, avoidFor: ['wrist'], focus: ['full', 'upper', 'lower'] },
  { id: 'forearm-plank', name: 'Forearm plank', type: 'core', pattern: 'core', equipment: ['bodyweight'], measure: 'time', sec: 40, avoidFor: [], focus: ['full', 'upper', 'lower'] },
  { id: 'ball-hamstring-curl', name: 'Stability-ball hamstring curl', type: 'core', pattern: 'core', equipment: ['stability-ball'], measure: 'reps', reps: 12, avoidFor: [], focus: ['lower', 'full'] },
  { id: 'ball-crunch', name: 'Stability-ball crunch', type: 'core', pattern: 'core', equipment: ['stability-ball'], measure: 'reps', reps: 15, avoidFor: ['back'], focus: ['upper', 'full'] },
  { id: 'ball-pass', name: 'Ball pass (hands to feet)', type: 'core', pattern: 'core', equipment: ['stability-ball'], measure: 'reps', reps: 10, avoidFor: [], focus: ['full', 'upper'] },
  { id: 'dead-bug', name: 'Dead bug', type: 'core', pattern: 'core', equipment: ['bodyweight'], measure: 'reps', reps: 10, perSide: true, avoidFor: [], focus: ['full', 'lower', 'upper'] },
  { id: 'russian-twist', name: 'Med-ball Russian twist', type: 'core', pattern: 'core', equipment: ['med-ball'], measure: 'reps', reps: 16, loadLb: 8, loadStep: 2, avoidFor: ['back'], focus: ['upper', 'full'] }
];

export const EX: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export const exName = (id: string) => EX[id]?.name ?? id;

/** Alternatives that keep the movement pattern and type but avoid the given constraints. */
export function alternativesFor(id: string, avoid: string[] = [], equipment?: string[]): Exercise[] {
  const base = EX[id];
  if (!base) return [];
  return EXERCISES.filter(
    (e) =>
      e.id !== id &&
      (e.pattern === base.pattern || (base.type === 'cardio' && e.type === 'cardio')) &&
      !e.avoidFor.some((c) => avoid.includes(c)) &&
      (!equipment || e.equipment.every((q) => equipment.includes(q) || q === 'bodyweight' || q === 'box'))
  ).sort((a, b) => Number(b.pattern === base.pattern) - Number(a.pattern === base.pattern));
}

export const EQUIPMENT_LABELS: Record<string, string> = {
  ropes: 'Battle ropes',
  dumbbells: 'Dumbbells',
  kettlebell: 'Kettlebell',
  'stability-ball': 'Stability ball',
  'med-ball': 'Med ball',
  bodyweight: 'Bodyweight',
  box: 'Box / bench',
  machines: 'Machines'
};

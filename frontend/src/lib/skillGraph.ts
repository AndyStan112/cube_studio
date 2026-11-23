import { availableSkill, prerequisitesMet, trees, type MethodId } from './curriculum';
import type { LearningProgress } from './learning';

// Coordinates are lanes and ranks, rather than a list with cosmetic offsets.
// Edges below come from the same prerequisites that actually unlock each skill.
export const skillGraph = [
  { id: 'notation', label: 'Notation', lane: 1, rank: 0 },
  { id: 'cross-one', label: 'One edge', lane: 0, rank: 1 },
  { id: 'slice-turns', label: 'Slice turns', lane: 2, rank: 1 },
  { id: 'white-cross', label: 'White cross', lane: 0, rank: 2 },
  { id: 'loading-spot', label: 'Loading spot', lane: 1, rank: 2 },
  { id: 'two-lines', label: 'Two lines', lane: 2, rank: 2 },
  { id: 'white-corners', label: 'First layer', lane: 0, rank: 3 },
  { id: 'first-block', label: 'First block', lane: 2, rank: 3 },
  { id: 'middle-edges', label: 'Middle layer', lane: 0, rank: 4 },
  { id: 'cross-planning', label: 'Plan the cross', lane: 1, rank: 4 },
  { id: 'yellow-cross', label: 'Yellow cross', lane: 0, rank: 5 },
  { id: 'flexible-loading', label: 'Flexible pairs', lane: 1, rank: 5 },
  { id: 'second-block', label: 'Second block', lane: 2, rank: 5 },
  { id: 'sune', label: 'Orient corners', lane: 1, rank: 6 },
  { id: 'j-perm', label: 'Place corners', lane: 1, rank: 7 },
  { id: 'beginner-finish', label: 'Finish layers', lane: 0, rank: 8 },
  { id: 'roux-arrow', label: 'Orient edges', lane: 2, rank: 8 },
  { id: 'roux-lr', label: 'Side edges', lane: 2, rank: 9 },
  { id: 'roux-finish', label: 'Finish Roux', lane: 2, rank: 10 },
];
export function skillMethods(id: string): MethodId[] {
  return (Object.keys(trees) as MethodId[]).filter(method => trees[method].nodes.some(node => node.id === id));
}
export function graphAvailable(id: string, progress: LearningProgress) {
  return skillMethods(id).some(method => availableSkill(method, id, progress));
}
export function skillMethod(id: string, progress: LearningProgress): MethodId {
  const methods = skillMethods(id);
  return methods.find(method => prerequisitesMet(method, id, progress)) ?? methods[0];
}
export const skillEdges = [...new Set(Object.values(trees).flatMap(tree => tree.nodes.flatMap(node => node.requires.flatMap(group => group.map(from => `${from}:${node.id}`)))))].map(edge => {
  const [from, to] = edge.split(':');
  return { from, to };
});

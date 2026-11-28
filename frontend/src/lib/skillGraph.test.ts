import { describe, expect, it } from 'vitest';
import { skills, trees, type MethodId } from './curriculum';
import { emptyLearning } from './learning';
import { graphAvailable, skillEdges, skillGraph, methodGraph } from './skillGraph';

const passed = (ids: string[]) => {
  const progress = emptyLearning();
  for (const id of ids) progress.skills[id] = { lesson: true, drills: 1, passed: true };
  return progress;
};
describe('branching skill map', () => {
  it('represents every skill once and connects only earlier prerequisite ranks', () => {
    expect(new Set(skillGraph.map(n => n.id)).size).toBe(Object.keys(skills).length);
    for (const edge of skillEdges) {
      const from = skillGraph.find(n => n.id === edge.from)!;
      const to = skillGraph.find(n => n.id === edge.to)!;
      expect(from).toBeDefined(); expect(to).toBeDefined();
      expect(from.rank).toBeLessThan(to.rank);
    }
  });
  it('unlocks independent layer, slice, and block-building choices after notation', () => {
    const progress = passed(['notation']);
    for (const id of ['cross-one', 'slice-turns', 'loading-spot', 'two-lines']) expect(graphAvailable(id, progress)).toBe(true);
    expect(graphAvailable('white-cross', progress)).toBe(false);
  });
  it('accepts either first-block route but also requires slice turns for the second block', () => {
    for (const route of ['loading-spot', 'two-lines']) {
      const progress = passed(['notation', route]);
      expect(graphAvailable('first-block', progress)).toBe(true);
      progress.skills['first-block'] = { lesson: true, drills: 1, passed: true };
      expect(graphAvailable('second-block', progress)).toBe(false);
      progress.skills['slice-turns'] = { lesson: true, drills: 1, passed: true };
      expect(graphAvailable('second-block', progress)).toBe(true);
    }
  });
  it('keeps shared corner passes from bypassing the Roux block prerequisites', () => {
    const progress = passed(['notation','cross-one','white-cross','white-corners','middle-edges','yellow-cross','sune','j-perm']);
    expect(graphAvailable('beginner-finish', progress)).toBe(true);
    expect(graphAvailable('roux-arrow', progress)).toBe(false);
  });
});

it('lays out every method without missing nodes, dangling edges or overlapping positions', () => {
  for(const method of Object.keys(trees) as MethodId[]) {
    const {nodes,edges}=methodGraph(method);
    expect(nodes.map(n=>n.id).sort()).toEqual(trees[method].nodes.map(n=>n.id).sort());
    expect(new Set(nodes.map(n=>`${n.lane}:${n.rank}`)).size).toBe(nodes.length);
    for(const edge of edges) expect(nodes.find(n=>n.id===edge.from)!.rank).toBeLessThan(nodes.find(n=>n.id===edge.to)!.rank);
    for(const n of nodes) {
      expect(skills[n.id].slides.length).toBeGreaterThan(0);
      expect(skills[n.id].quiz || skills[n.id].cases.length>0).toBeTruthy();
    }
  }
});

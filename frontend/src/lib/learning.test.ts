import { describe, expect, it } from 'vitest';
import { applyMove, inverse, solved } from './cube';
import { skills, trees, prerequisitesMet, availableSkill } from './curriculum';
import { caseState, checkSkillMoves, goalMet, parseLearningMoves } from './learningGoals';
import { earnLearning, emptyLearning, levelCost, levelInfo } from './learning';
import { cubiesToFacelets } from './facelets';

describe('visual curriculum cases', () => {
  for (const skill of Object.values(skills)) for (const [index, challenge] of skill.cases.entries()) {
    it(`${skill.id} case ${index + 1} starts incomplete and its taught sequence meets the goal`, () => {
      expect(goalMet(caseState(challenge.solution), challenge.goal, challenge.target)).toBe(false);
      expect(checkSkillMoves(challenge.solution, challenge.solution.join(' '), challenge.goal, challenge.target)).toBe(true);
    });
  }
  it('accepts alternate solutions and rejects unrelated turns', () => {
    expect(checkSkillMoves(['F2'], 'U U\' F F', 'edge', [0,-1,1])).toBe(true);
    expect(checkSkillMoves(['F2'], 'R', 'edge', [0,-1,1])).toBe(false);
    expect(() => parseLearningMoves('not a move')).toThrow();
    expect(() => parseLearningMoves('')).toThrow();
  });
  it('supports M/E/S with correct conventional directions and reversible animation states', () => {
    for (const [move, equivalent] of [['M','2L'],['E','2D'],['S','2F']]) {
      expect(cubiesToFacelets(applyMove(solved(), move))).toBe(cubiesToFacelets(applyMove(solved(), equivalent)));
      expect(cubiesToFacelets(inverse([move]).reduce((s,m) => applyMove(s,m), applyMove(solved(),move)))).toBe(cubiesToFacelets(solved()));
    }
  });
});
describe('shared skill gating', () => {
  it('shares completed skills but does not let them bypass prerequisites in the other method', () => {
    const p = emptyLearning();
    for (const id of ['notation','cross-one','white-cross','white-corners','middle-edges','yellow-cross','sune','j-perm']) p.skills[id] = { lesson:true,drills:1,passed:true };
    expect(availableSkill('roux','sune',p)).toBe(true);
    expect(prerequisitesMet('roux','roux-arrow',p)).toBe(false);
    expect(prerequisitesMet('beginner','beginner-finish',p)).toBe(true);
    for (const id of ['slice-turns','two-lines','first-block','second-block']) p.skills[id] = {lesson:true,drills:1,passed:true};
    expect(prerequisitesMet('roux','roux-arrow',p)).toBe(true);
    expect(p.skills['loading-spot']).toBeUndefined();
  });
  it('has only real prerequisite IDs, shared notation roots and non-gating speed branches', () => {
    for (const [method, tree] of Object.entries(trees)) {
      expect(tree.nodes[0].id).toBe('notation');
      for (const node of tree.nodes) {
        expect(skills[node.id]).toBeDefined();
        for (const group of node.requires) for (const id of group) expect(tree.nodes.some(n => n.id === id)).toBe(true);
        if (node.kind === 'speed') expect(tree.nodes.some(n => n.requires.some(g => g.includes(node.id)))).toBe(false);
      }
    }
  });
});
describe('leveling and XP provenance', () => {
  it('has an increasing gentle exponential curve and exact level boundaries', () => {
    expect(levelInfo(0)).toMatchObject({level:1,current:0,needed:100});
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100)).toMatchObject({level:2,current:0});
    let cumulative = 0;
    for (let level=1;level<=100;level++) {
      expect(levelCost(level+1)).toBeGreaterThan(levelCost(level));
      cumulative += levelCost(level);
      expect(levelInfo(cumulative).level).toBe(level+1);
    }
  });
  it('gates test XP, shares first-pass rewards, tapers repeat drills and records every award', () => {
    let p = emptyLearning();
    expect(earnLearning(p,{type:'test',skill:'notation'}).earned).toBe(0);
    p = earnLearning(p,{type:'lesson',skill:'notation',method:'beginner'}).progress;
    expect(earnLearning(p,{type:'lesson',skill:'notation',method:'roux'}).earned).toBe(0);
    p = earnLearning(p,{type:'drill',skill:'notation',method:'beginner'}).progress;
    p = earnLearning(p,{type:'test',skill:'notation',method:'beginner'}).progress;
    expect(earnLearning(p,{type:'test',skill:'notation',method:'roux'}).earned).toBe(0);
    const repeated = earnLearning(p,{type:'drill',skill:'notation',method:'roux'});
    expect(repeated.earned).toBeLessThan(20);
    expect(repeated.progress.ledger.at(-1)).toMatchObject({source:'drill',repeat:true,method:'roux',skillId:'notation'});
    expect(p.xp).toBe(195);
    expect(p.ledger.reduce((sum,event) => sum + event.amount,0)).toBe(p.xp);
  });
  it('deduplicates timer awards, excludes DNF and preserves solve context', () => {
    const action = {type:'solve' as const,id:'solve-1',dnf:false,event:'333' as const,method:'Roux',sessionId:'session-1',cubeId:'gan',manual:false};
    const {progress,earned} = earnLearning(emptyLearning(),action);
    expect(earned).toBe(10);
    expect(progress.ledger[0]).toMatchObject({source:'timer',amount:10,solveId:'solve-1',sessionId:'session-1',cubeId:'gan',event:'333',manual:false});
    expect(earnLearning(progress,action).earned).toBe(0);
    expect(earnLearning(progress,{...action,id:'solve-2',dnf:true}).earned).toBe(0);
  });
});

import catalogData from './algorithmCatalog.json';
import type { AlgorithmCatalog } from './api';
import type { SkillNode, TreeNode, LessonSlide } from './curriculum';
import type { Goal } from './learningGoals';
const catalog = catalogData as AlgorithmCatalog;
const moves = (s: string) => s.split(/\s+/).filter(Boolean);
const page = (title: string, text: string, sequence = ''): LessonSlide => ({title, text, moves:moves(sequence)});
const exercise = (label: string, sequence: string, goal: Goal = 'solved') => ({label, solution:moves(sequence), goal});
const node = (id: string, title: string, subtitle: string, slides: LessonSlide[], cases: SkillNode['cases'], drill: string): SkillNode => ({id,title,subtitle,minutes:Math.max(5, slides.length*2),slides,cases,drill});
const sune = "R U R' U R U2 R'";
const ua = "R U' R U R U R U' R' U' R2";
const pair = "U R U' R'";
export const advancedSkills: SkillNode[] = [
  node('cfop-cross','Plan the full cross','Inspect four edges; solve underneath.',[
    page('Choose a cross color','Start with a familiar color on D. Locate its four edges and identify each side center. Opposite colors remain opposite even when you rotate the cube.','F2 R2 B2 L2'),
    page('Plan before turning','Track where every planned move sends the next edge. Solve edges relative to each other, then use D to align the whole cross. Start with two planned edges and gradually add the others.','F2 R2'),
    page('Execute without looking down','Rehearse your plan, look away, and solve the cross. Check all four side matches. During full solves use the final cross moves to locate the first F2L corner and edge.','F2 R2 B2 L2'),
    page('Use inspection deliberately','Practice within 15 seconds of inspection when ready. Do not chase an eight-move limit before you can reliably plan and execute a complete cross.','R U R\' F2'),
  ],[exercise('Restore the cross.','F2 R2 B2 L2','cross'),exercise('Track the displaced edge and restore the cross.',"R U R' F2",'cross')],'Plan each setup without turning. Execute from memory, then check every cross edge.'),
  node('cfop-pairing','Understand F2L pairs','Join a corner and edge before insertion.',[
    page('Find a pair by its colors','White-red-green belongs with the red-green edge. Both pieces share the same two side colors; together they fill the front-right slot.',pair),
    page('Hide the corner','Move the corner out of U, turn U to position the edge, then bring the corner back. Watch how a connected pair forms without disturbing the cross.',"R U R'"),
    page('Separate a bad pair','A connected corner and edge can be connected incorrectly. Use an empty slot to separate them, then pair again. Preserve the slots already solved.',"R U2 R' U' R U R'"),
    page('Insert as one unit','Line the pair up over its matching centers. Open the slot, bring the pair in, and close the slot. Learn both R U R′ and R U′ R′ insertions.',pair),
  ],[exercise('Insert the front-right pair.',pair,'f2l'),exercise('Rebuild the pair and restore F2L.',"R U2 R' U' R U R'",'f2l')],'Identify both pieces before moving. Explain the pairing move, then insert without breaking solved slots.'),
  node('cfop-lookahead','Look ahead through F2L','Track the next pair during a known insertion.',[
    page('Slow the turns, remove the stop','Use a pace where you can watch unsolved pieces. A fast insertion followed by a long search is a cue to slow down.',pair),
    page('Track one piece first','While inserting a known pair, follow one unsolved corner. Predict its destination, then find its matching edge after the insertion.',"R U R'"),
    page('Use back slots','Solve a pair into the back when that keeps the front workspace visible. Learn the view after a y rotation before removing that rotation from your solutions.',"y R U R' y'"),
    page('Measure pauses separately','Record a solve. Count pauses between pairs, unnecessary rotations and repeated regrips. Work on one recurring problem before timing another average.',pair),
  ],[exercise('Insert smoothly while tracking the next pieces.',pair,'f2l')],'On a physical scramble, solve F2L slowly without stopping. Use these isolated cases to rehearse tracking during insertion.'),
  node('cfop-two-oll','Two-look OLL','Orient edges, then corners.',[
    page('Edges before corners','Ignore corners. For a line, hold the oriented edges at UL and UR and use F R U R′ U′ F′.',"F R U R' U' F'"),
    page('Elbow and dot','Hold an elbow with oriented edges at UB and UL; use Fw R U R′ U′ Fw′. A dot needs two stages: use the line sequence, recognize the elbow, then set it up.',"Fw R U R' U' Fw'"),
    page('Seven corner patterns','Once the yellow cross is made, recognize Sune, anti-Sune, H, Pi, U, T and L. The 2-look OLL library contains a direct sequence for each; match side stickers as well as the top.',sune),
    page('AUF is a setup','Use U, U′ or U2 to match the displayed case before starting. Orientation leaves the side pieces permuted; that is PLL’s job.',sune),
  ],[exercise('Make the yellow cross.',"F R U R' U' F'",'yellow-cross'),exercise('Orient the last-layer corners.',sune,'top-oriented')],'Name the edge pattern first. After orienting edges, identify a corner pattern before executing.'),
  node('cfop-two-pll','Two-look PLL','Place corners, then cycle edges.',[
    page('Adjacent corner swap','Find a matching corner pair on one side. For the displayed T permutation, hold the headlights on the left. This solves corners but may leave edges displaced.',"R U R' U' R' F R2 U' R' U' R U R' F'"),
    page('No headlights','A diagonal corner swap has no matching pair. Use the E case in the 2-look PLL library, or do an adjacent-swap sequence once and recognize again.',"R U R' U' R' F R2 U' R' U' R U R' F'"),
    page('Four edge permutations','Ua and Ub cycle three edges in opposite directions; H swaps opposite edges; Z swaps adjacent pairs. Use the library’s four edge cases after placing the corners.',ua),
    page('Finish with AUF','Even with every top piece correctly related, the layer may need U, U′ or U2 to match the centers. Include that adjustment in each timed repetition.',ua+' U'),
  ],[exercise('Finish a three-edge cycle.',ua),exercise('Finish and align the top layer.',ua+' U')],'First check corners, then edges. Rehearse recognition and the final top adjustment as part of the solve.'),
  node('roux-inspection','Plan an efficient first block','Use the pieces the scramble gives you.',[
    page('A block, not a face','A 1×2×3 block contains a bottom-side edge and two corner-edge pairs. Each side color must agree. A solid-looking left face alone is not enough.',"R' F"),
    page('Compare candidate starts','Find an existing pair, a one-move pair and a useful bottom-side edge. Compare two candidate blocks before committing; do not destroy a made pair just to follow a fixed recipe.',"R B'"),
    page('Track the whole solution','Plan the base edge plus one pair first. Predict the last pair’s location after those moves, then extend your inspection plan to the full block.',"R' F R B'"),
  ],[exercise('Build a complete first block.',"R' F R B'",'left-block')],'On random scrambles, inspect two candidate first blocks. Compare move counts and how easily you can track the second block.'),
  node('roux-second-efficiency','Improve the second block','Pair with R, U and M; preserve the first block.',[
    page('Use the free layers','Once the left block is built, R, U and M give a workspace for the right block. Start by locating the right base edge and the two matching corner-edge pairs.',"R U R'"),
    page('Keep options open','Solve a square first when convenient. Avoid inserting a pair in a way that traps the remaining pieces. Try two insertion orders on the same scramble.',"R U' R' U R U R'"),
    page('Preview the corners','During the last pair, follow the U-color corner stickers. Aim to recognize the CMLL orientation before the block finishes.',"R U R'"),
  ],[exercise('Finish the right block without disturbing the left.',"R U' R' U R U R'",'two-blocks')],'Solve only the two blocks on physical scrambles. Count rotations and compare different second-block pair orders.'),
  node('roux-lse-lookahead','Connect the LSE steps','Track side edges during orientation.',[
    page('EO uses the center frame','Check orientation with U/D centers aligned first. Count the six edges in the U/M workspace, including the two on D; valid bad-edge counts are 0, 2, 4 or 6.',"M' U' M'"),
    page('Track UL and UR','While fixing EO, watch the two edges needed to complete the side faces. Predict their locations after your final arrow action.',"M' U2 M"),
    page('Finish centers as well as edges','After UL/UR placement, solve the remaining four edges with M and U2. A final M alignment may still be needed; check both U and D centers.',"M' U2 M U2"),
  ],[exercise('Orient the arrow while tracking the side edges.',"M' U' M'",'roux-oriented'),exercise('Solve the remaining middle edges.',"M' U2 M U2")],'On full LSE cases, pause only before EO. Name the predicted side-edge locations before completing the rest.'),
  node('oh-grip','One-handed grip and turns','Choose a hand and make R/U comfortable.',[
    page('Choose by control','Try both hands slowly. Many solvers use the left hand for convenient R and U′ turns, but choose the hand that gives you stable, repeatable control. Keep the wrist relaxed.','R U\' R\' U'),
    page('Give each turn a finger','With the left hand, explore a little-finger R push and index-finger U′ pull. Reposition the cube when needed; avoid squeezing so tightly that layers catch.','R U\' R\' U'),
    page('Half turns and recovery','Practice U2 and R2 as controlled double flicks or two quarter turns. Reset your grip between repetitions. Stop if a movement hurts.','R2 U2 R2 U2'),
    page('Learn your other hand honestly','Right-hand finger tricks differ. Mirror a comfortable trigger by swapping R/L and reversing turn directions, then check the resulting case in the viewer before using it in solves.',"L' U L U'"),
  ],[exercise('Execute a controlled one-handed trigger.',"R U' R' U")],'Perform ten accurate repetitions with your chosen hand. The move checker verifies the solution, not which hand you use.'),
  node('oh-cross','One-handed cross planning','Plan the cross; budget your regrips.',[
    page('Reuse your method','First learn a complete two-handed solve in the Beginner or Roux path. One-handed is an event: keep your method and adapt execution. For CFOP, plan the cross on D before starting.','F2 R2'),
    page('Compare grips, not just moves','A slightly longer R/U-friendly solution can be easier than a short sequence with awkward B or D turns. Test both slowly and count the grip changes.','F2 R2 B2 L2'),
    page('Turn the cube deliberately','Use a rotation when it makes the next sequence easier. Decide where to rotate before beginning rather than losing your place mid-cross.','y R2 F2 y\''),
  ],[exercise('Solve the cross with a planned one-handed grip.','F2 R2 B2 L2','cross')],'Plan a cross, including regrips, and execute without inspection during the moves. Check side-color matches.'),
  node('oh-f2l','One-handed F2L','Comfortable pairs with fewer pauses.',[
    page('Use familiar pair ideas','Pair the corner and edge using an empty slot, then insert. Keep your two-handed recognition; change the finger tricks before replacing an entire solution.',pair),
    page('Learn both insertion directions','R U R′ and R U′ R′ feel different in one hand. Practice the weaker direction slowly; choose a rotation or alternate slot when it improves control.',"R U' R'"),
    page('Look ahead at a steady pace','Watch the next unsolved corner during the insertion you already know. Increase turn speed only when you can keep tracking it.',pair),
  ],[exercise('Insert the front-right pair one-handed.',pair,'f2l'),exercise('Rehearse the opposite U direction.',"R U R'",'f2l')],'On physical scrambles, solve four pairs one-handed without a timer. Note awkward regrips and practise those transitions.'),
  node('oh-last-layer','One-handed last layer','Choose algorithms by grip and accuracy.',[
    page('Begin with two looks','Use the OLL and PLL you already know while adapting the grip. Recognition is shared with two-handed solving. Learn new sequences in small groups.',sune),
    page('Use the OH library','The one-handed OLL and PLL sets include every standard case, with sequences selected for left-hand execution. Start with U perms, Sune and anti-Sune before learning awkward G/N cases.',ua),
    page('Slice alternatives','A two-handed M flick may be awkward in one hand. Compare an R/U edge permutation with your slice version. For Roux, practise supported M turns slowly before linking LSE.',ua),
    page('Train transitions','Start in your end-of-F2L grip, recognize the case, execute, then include the final AUF. A fast isolated algorithm can still be slow if it needs two extra regrips in a solve.',sune),
  ],[exercise('Execute Sune from a stable OH grip.',sune),exercise('Finish a one-handed U permutation.',ua)],'Use your solving hand throughout. Match the viewer angle and include recognition and AUF in timed repetitions.'),
  node('oh-roux','One-handed Roux','Adapt blocks and the M/U finish.',[
    page('Keep blockbuilding flexible','Build the same two 1×2×3 blocks. Choose comfortable pair solutions rather than forcing two-handed finger tricks. A rotation can be worthwhile when it avoids an awkward grip.',"R U R'"),
    page('Test slice control','Explore a table-supported grip for M turns during practice. Keep the cube stable and use only your solving hand once the solve starts. Practise accurate M, M′ and M2 before speed.','M U M\' U\''),
    page('Choose CMLL by execution','Recognize the same corner patterns as two-handed Roux. Test each sequence with your hand, including entry and exit grips, before adding it to full solves.',sune),
    page('Link EO to the finish','Track UL/UR while executing EO. Practise M/U sequences with controlled doubles, then restore the centers to finish.',"M' U2 M U2"),
  ],[exercise('Execute the final middle-edge cycle one-handed.',"M' U2 M U2")],'On a physical cube, practise supported M/U control and a complete LSE finish. The app checks the cube result, not hand use.'),
];

// Case lessons share the canonical library sequences, so a corrected algorithm
// updates the demonstration, setup, drill and test together.
function caseLesson(id: string, title: string, set: string, section: string, goal: Goal) {
  const algorithms = catalog.algorithms.filter(a => a.memberships.some(m => m.set_id===set && m.section_ids.includes(section)));
  return node(id,title,`${algorithms.length} recognition cases with visual setups.`,[
    page('Recognize before executing',set==='f2l' ? 'Identify the corner’s white sticker and whether the edge is connected, separated or trapped in a slot. These cases solve the front-right slot; learn the piece relationship before mirroring to another slot.' : set==='cmll' ? 'First classify the U-color corner pattern. Then compare side-sticker pairs to distinguish cases within the family. Ignore top edges: CMLL only needs to preserve the two lower side blocks.' : 'Match the top pattern, then check side stickers from two adjacent sides. Turn U to match the displayed holding angle. Learn one case at a time and revisit it mixed with cases you already know.', algorithms[0].variations[0].moves),
    ...algorithms.map(a => page(a.name,a.description,a.variations[0].moves)),
    page('Mix recognition cases','After clean isolated repetitions, alternate cases without reading the name. Include setup recognition and final alignment in your timing. A pass here checks these cases; revisit the family in full solves.',algorithms.at(-1)!.variations[0].moves),
  ],algorithms.map(a=>exercise(`Solve ${a.name}.`,a.variations[0].moves,goal)), 'Set up the inverse case on your cube. Name its distinguishing stickers, execute once, and check the preserved pieces.');
}
export const familyIds: Record<string,string[]> = {};
for (const [set,goal] of [['f2l','f2l'],['oll','top-oriented'],['pll','solved'],['cmll','top-corners'],['oh-oll','top-oriented'],['oh-pll','solved']] as const) {
  familyIds[set]=[];
  for (const section of catalog.sets.find(s=>s.id===set)!.sections) {
    const id=`study-${set}-${section.id}`;
    advancedSkills.push(caseLesson(id,`${set.toUpperCase()} · ${section.name}`,set,section.id,goal));
    familyIds[set].push(id);
  }
}
const core = (id: string, ...requires: string[]): TreeNode => ({id,requires:requires.map(r=>[r]),kind:'core'});
export const cfopNodes: TreeNode[] = [core('notation'),core('cross-one','notation'),core('white-cross','cross-one'),core('cfop-cross','white-cross'),core('cfop-pairing','cfop-cross'),core('cfop-two-oll','cfop-pairing'),core('cfop-two-pll','cfop-two-oll'), ...familyIds.f2l.map(id=>core(id,'cfop-pairing')), ...familyIds.oll.map(id=>core(id,'cfop-two-pll')), ...familyIds.pll.map(id=>core(id,'cfop-two-pll')), {id:'cfop-lookahead',requires:[['cfop-pairing']],kind:'speed'}];
export const ohNodes: TreeNode[] = [core('notation'),core('oh-grip','notation'),core('oh-cross','oh-grip'),core('oh-f2l','oh-cross'),core('oh-last-layer','oh-f2l'),...familyIds['oh-oll'].map(id=>core(id,'oh-last-layer')),...familyIds['oh-pll'].map(id=>core(id,'oh-last-layer')),core('slice-turns','notation'),core('oh-roux','oh-grip','slice-turns')];
export const rouxExtensions: TreeNode[] = [core('roux-inspection','roux-finish'),core('roux-second-efficiency','roux-inspection'),...familyIds.cmll.map(id=>core(id,'roux-second-efficiency')), {id:'roux-lse-lookahead',requires:[['roux-finish']],kind:'speed'}];

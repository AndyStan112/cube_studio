export type MoveQuestion = { move: string; answer: string; options: string[] };
const names: Record<string,string> = {R:'right face',L:'left face',U:'top face',D:'bottom face',F:'front face',B:'back face',M:'middle slice (L direction)',E:'equator slice (D direction)',S:'standing slice (F direction)'};
export function moveAnswer(move: string) {
  return `${names[move[0]]} · ${move.endsWith('2') ? 'half turn (180°)' : move.endsWith("'") ? 'counterclockwise (90°)' : 'clockwise (90°)'}`;
}
export function notationQuestions(slices = false): MoveQuestion[] {
  const moves = slices ? ['M',"M'",'M2','U',"U'",'U2'] : ['R',"L'",'U2','D',"F'",'B2'];
  // Shuffle attempts while always testing each face (and all three turn kinds).
  const shuffled = moves.map(move => ({move,sort:crypto.getRandomValues(new Uint32Array(1))[0]})).sort((a,b) => a.sort-b.sort);
  return shuffled.map(({move}) => {
    const face = move[0], other = face === 'R' ? 'L' : face === 'M' ? 'R' : 'R';
    const wrong = move.endsWith("'") ? face : `${face}'`;
    return { move, answer:moveAnswer(move), options:[moveAnswer(move),moveAnswer(wrong),moveAnswer(`${other}2`),moveAnswer(move.endsWith('2') ? face : `${face}2`)].filter((value,i,array) => array.indexOf(value) === i).map(answer => ({answer,sort:crypto.getRandomValues(new Uint32Array(1))[0]})).sort((a,b) => a.sort-b.sort).map(item => item.answer) };
  });
}

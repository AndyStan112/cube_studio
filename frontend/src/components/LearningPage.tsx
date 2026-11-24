import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Box, Check, ChevronRight, Info, Layers3, LockKeyhole, RotateCcw, Sparkles, Trophy, Zap } from 'lucide-react';
import { applyMove, inverse, type Cubie } from '../lib/cube';
import { skills, trees, type MethodId, type SkillNode } from '../lib/curriculum';
import { blankSkill, drillReward, levelInfo, type LearningAction, type LearningProgress } from '../lib/learning';
import { caseState, goalMet, parseLearningMoves } from '../lib/learningGoals';
import { notationQuestions } from '../lib/learningQuiz';
import { moveDescription } from '../lib/teaching';
import LearningCube from './LearningCube';
import Sheet from './Sheet';
import { graphAvailable, skillEdges, skillGraph, skillMethod, skillMethods } from '../lib/skillGraph';
import './LearningPage.css';
type Props = { progress: LearningProgress; award: (action: LearningAction) => number };
type Phase = 'lesson' | 'drill' | 'test';
const noMoves: string[] = [];
export default function LearningPage({ progress, award }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [activity, setActivity] = useState(false);
  const [help, setHelp] = useState(false);
  const historySession = useRef(crypto.randomUUID());
  useEffect(() => { const back = (event: PopStateEvent) => { setFocused(null); setSelected(event.state?.cubeLearning?.session === historySession.current ? event.state.cubeLearning.skill : null); }; window.addEventListener('popstate', back); return () => window.removeEventListener('popstate', back); }, []);
  const closeSkill = () => { if (history.state?.cubeLearning?.session === historySession.current) history.back(); else setSelected(null); };
  const level = levelInfo(progress.xp);
  const mastered = skillGraph.filter(n => progress.skills[n.id]?.passed).length;
  const next = skillGraph.find(n => !progress.skills[n.id]?.passed && graphAvailable(n.id, progress));
  const mapScroll = useMemo(() => ({ top: 0 }), []);
  useEffect(() => {
    document.body.classList.toggle('learning-in-session', !!selected);
    if (selected) window.scrollTo({ top: 0, behavior: 'instant' });
    else window.scrollTo({ top: mapScroll.top, behavior: 'instant' });
    return () => document.body.classList.remove('learning-in-session');
  }, [selected, mapScroll]);
  const openSkill = (id: string) => { mapScroll.top = window.scrollY; history.pushState({ ...history.state, cubeLearning: { skill: id, session: historySession.current } }, ''); setFocused(null); setSelected(id); };
  if (selected) return <SkillFlow key={selected} skill={skills[selected]} method={skillMethod(selected, progress)} progress={progress} award={award} onBack={closeSkill} />;
  const point = (id: string) => { const node = skillGraph.find(n => n.id === id)!; return { x: 50 + node.lane * 100, y: 38 + node.rank * 148 }; };
  return <div className="learning-shell">
    <div className="learning-map-toolbar"><div><strong>{mastered} / {skillGraph.length} skills</strong><small>Level {level.level} · {progress.xp} XP</small></div>{next && <button className="text-button" onClick={() => openSkill(next.id)}>Continue</button>}<button className="icon-button" aria-label="About the skill tree" onClick={() => setHelp(true)}><Info size={21}/></button></div>
    <div className="learning-route-labels"><span>Layers</span><span>Blocks · Roux</span></div>
    <div className="skill-map" aria-label="Cube skills: branching prerequisite map" style={{ height: 11 * 148 }}>
      <svg className="skill-connections" viewBox={`0 0 300 ${11 * 148}`} preserveAspectRatio="none" aria-hidden="true">
        {skillEdges.map(({ from, to }) => {
          const a = point(from), b = point(to);
          const longSide = a.x === b.x && b.y - a.y > 160;
          const d = longSide ? `M ${a.x+34} ${a.y} C 298 ${a.y},298 ${b.y},${b.x+34} ${b.y}` : `M ${a.x} ${a.y+40} C ${a.x} ${(a.y+b.y)/2},${b.x} ${(a.y+b.y)/2},${b.x} ${b.y-40}`;
          return <path key={`${from}:${to}`} d={d} className={progress.skills[from]?.passed ? 'is-complete' : ''} vectorEffect="non-scaling-stroke"/>;
        })}
      </svg>
      {skillGraph.map(node => {
        const status = progress.skills[node.id] ?? blankSkill(), available = graphAvailable(node.id, progress);
        const speed = node.id === 'cross-planning' || node.id === 'flexible-loading';
        const NodeIcon = status.passed ? Check : !available ? LockKeyhole : speed ? Zap : node.id === 'notation' ? BookOpen : node.id.includes('finish') ? Trophy : node.lane === 2 ? Box : Layers3;
        const completed = Number(status.lesson) + Number(status.drills > 0) + Number(status.passed);
        return <div className={`map-node ${status.passed ? 'is-mastered' : available ? 'is-available' : 'is-locked'} ${speed ? 'is-speed' : ''}`} key={node.id} style={{ left: `${(node.lane+.5)/3*100}%`, top: node.rank * 148 }}>
          <button className="map-node-button" aria-label={`${skills[node.id].title}, ${status.passed ? 'mastered' : available ? `${completed} of 3 steps complete` : 'locked'}`} aria-haspopup="dialog" onClick={() => setFocused(node.id)}><NodeIcon size={26}/></button>
          <span className="map-node-steps" aria-hidden="true">{[status.lesson, status.drills > 0, status.passed].map((done,i) => <i key={i} className={done ? 'is-done' : ''}/>)}</span><span className="map-node-label">{node.label}</span>
        </div>;
      })}
    </div>

    {focused && <Sheet title={skills[focused].title} onClose={() => setFocused(null)}>
      <p className="node-summary">{skills[focused].subtitle}</p>
      <div className="node-steps">{[['Lesson',progress.skills[focused]?.lesson],['Practice',!!progress.skills[focused]?.drills],['Test',progress.skills[focused]?.passed]].map(([label,done]) => <span key={String(label)}>{done ? <Check size={17}/> : <span className="step-empty"/>}{label}</span>)}</div>
      {!graphAvailable(focused, progress) && <div className="node-prerequisites"><h3>Unlock this skill</h3>{skillMethods(focused).map(method => <div key={method}><strong>{trees[method].title}</strong>{trees[method].nodes.find(n => n.id === focused)!.requires.map((group,i) => <p key={i}>{group.map(id => skills[id].title).join(' or ')}</p>)}</div>)}</div>}
      <button className="button" disabled={!graphAvailable(focused, progress)} onClick={() => openSkill(focused)}>{progress.skills[focused]?.passed ? 'Practise again' : progress.skills[focused]?.lesson ? 'Resume skill' : 'Start lesson'} · {skills[focused].minutes} min</button>
    </Sheet>}
    {help && <Sheet title="Your skill tree" onClose={() => setHelp(false)}><div className="solver-info-copy"><p>Follow the connectors to build skills in layers or blocks. Some skills are shared between both routes.</p><p>Each node has a lesson, practice and a test. Passing the test unlocks connected skills. Either loading spot or two lines unlocks the first block; the second block also needs slice turns.</p><p>Lightning nodes are optional technique upgrades. Learning progress is saved for this profile on this device.</p><button className="text-button" onClick={() => { setHelp(false); setActivity(true); }}>View XP activity</button></div></Sheet>}
    {activity && <Sheet title="XP activity" onClose={() => setActivity(false)}><XPActivity progress={progress}/></Sheet>}
  </div>;
}
function XPActivity({progress}: {progress:LearningProgress}) {
  const labels = {lesson:'Lessons',drill:'Drills',test:'Tests',timer:'Timer solves',legacy:'Earlier XP'};
  return <section className="xp-activity card" aria-label="XP activity"><h3>Where your XP comes from</h3><div className="xp-sources">{(['lesson','drill','test','timer'] as const).map(source => <div key={source}><span>{labels[source]}</span><strong>{progress.ledger.filter(e => e.source === source).reduce((sum,e) => sum+e.amount,0)} XP</strong></div>)}</div>{progress.ledger.length ? <ol>{progress.ledger.slice(-8).reverse().map(event => <li key={event.id}><span>{event.skillId ? skills[event.skillId]?.title ?? event.skillId : labels[event.source]}<small>{event.source}{event.repeat ? ' · repeat' : ''}{event.method ? ` · ${event.method}` : ''} · {new Date(event.createdAt).toLocaleString()}</small></span><strong>+{event.amount} XP</strong></li>)}</ol> : <p>No activity yet.</p>}</section>;
}
function SkillFlow({skill,method,progress,award,onBack}: Props & {skill:SkillNode;method:MethodId;onBack:()=>void}) {
  const status = progress.skills[skill.id] ?? blankSkill();
  const [phase,setPhase] = useState<Phase>(status.passed ? 'drill' : status.drills ? 'test' : status.lesson ? 'drill' : 'lesson');
  const [slide,setSlide] = useState(0);
  const [notice,setNotice] = useState('');
  const [celebration,setCelebration] = useState(false);
  const [testAttempt,setTestAttempt] = useState(0);
  const grant = (type:'lesson'|'drill'|'test') => { const amount = award({type,skill:skill.id,method,event:'333'}); setNotice(amount ? `+${amount} XP` : type === 'test' ? 'Test passed' : 'Completed'); return amount; };
  return <div className="learning-shell skill-flow"><header className="skill-session-header"><button className="icon-button" aria-label="Back to skill tree" onClick={onBack}><ArrowLeft size={22}/></button><div className="skill-session-progress" role="progressbar" aria-label="Skill progress" aria-valuemin={0} aria-valuemax={3} aria-valuenow={celebration ? 3 : phase === 'test' ? 2 : phase === 'drill' ? 1 : 0}><i style={{width: `${celebration ? 100 : phase === 'test' ? 67 : phase === 'drill' ? 33 : 0}%`}}/></div><span>{celebration ? 3 : phase === 'test' ? 3 : phase === 'drill' ? 2 : 1}/3</span></header><h2 className="skill-session-title">{skill.title}</h2>
    <nav className="skill-phases" aria-label="Skill steps">{(['lesson','drill','test'] as const).map((value,index) => <button key={value} aria-current={phase === value ? 'step' : undefined} disabled={value === 'drill' && !status.lesson || value === 'test' && (!status.lesson || !status.drills)} onClick={() => {setPhase(value);setNotice('');setCelebration(false);}}><span>{value === 'lesson' && status.lesson || value === 'drill' && status.drills || value === 'test' && status.passed ? <Check size={14}/> : index+1}</span>{value === 'drill' ? 'Exercises' : value === 'test' ? 'Test' : 'Lesson'}</button>)}</nav>
    {notice && !celebration && <div className="xp-notice" role="status"><Sparkles size={17}/>{notice}</div>}
    {celebration ? <section className="skill-celebration card"><span className="celebration-icon"><Trophy size={38}/></span><h3>Skill mastered</h3><p>{notice || 'Test passed'}</p><div className="skill-bottom-actions"><button className="button" onClick={onBack}>Back to skill tree</button><button className="text-button" onClick={() => {setCelebration(false);setPhase('drill');}}>Keep drilling · +{drillReward(status.drills)} XP</button></div></section> : phase === 'lesson' ? <section className="skill-workspace card"><LearningCube key={`${skill.id}:${slide}`} {...skill.slides[slide]} autoPlay label={skill.slides[slide].title}/><div className="skill-instruction"><span className="learning-eyebrow">{slide+1} / {skill.slides.length} · VISUAL LESSON</span><h3>{skill.slides[slide].title}</h3><p>{skill.slides[slide].text}</p><div className="slide-dots" aria-label="Lesson slides">{skill.slides.map((s,i) => <button key={i} aria-label={`Slide ${i+1}: ${s.title}`} aria-current={slide === i ? 'step' : undefined} onClick={() => setSlide(i)}/>)}</div><div className="skill-bottom-actions"><button className="icon-button" aria-label="Previous slide" disabled={!slide} onClick={() => setSlide(i => i-1)}><ArrowLeft size={18}/></button><button className="button" onClick={() => {if(slide < skill.slides.length-1)setSlide(i => i+1);else {grant('lesson');setPhase('drill');}}}>{slide < skill.slides.length-1 ? 'Next' : status.lesson ? 'Go to exercises' : 'Start practice'}<ArrowRight size={16}/></button></div></div></section> : phase === 'drill' ? <DrillPanel skill={skill} completed={status.drills} onComplete={() => grant('drill')} onTest={() => {setNotice('');setPhase('test');}}/> : <SkillTest key={testAttempt} skill={skill} onRestart={() => {setTestAttempt(n => n+1);setNotice('');}} onPass={() => {grant('test');setCelebration(true);}}/>}
  </div>;
}
function DrillPanel({skill,completed,onComplete,onTest}: {skill:SkillNode;completed:number;onComplete:()=>void;onTest:()=>void}) {
  const [variation,setVariation] = useState(completed % Math.max(1,skill.cases.length));
  const [showDemo,setShowDemo] = useState(false);
  const challenge = skill.cases[variation % skill.cases.length];
  const quizMove = (skill.quiz === 'slices' ? ['M',"M'",'M2','U',"U'",'U2'] : ['R',"F'",'U2','L',"B'",'D2'])[variation % 6];
  const state = useMemo(() => challenge ? caseState(challenge.solution) : undefined,[challenge]);
  return <section className="skill-workspace card"><div><LearningCube key={`${variation}:${showDemo}`} moves={skill.quiz ? [quizMove] : showDemo ? challenge.solution : noMoves} initialState={skill.quiz ? undefined : state} startSolved={!!skill.quiz} autoPlay={!!skill.quiz || showDemo} target={challenge?.target ? [challenge.target] : undefined}/>{!skill.quiz && <details className="physical-setup"><summary>Set up this case on your own cube</summary><p>Start solved, yellow up and red front.</p><code>{inverse(challenge.solution).join(' ')}</code></details>}</div><div className="skill-instruction"><span className="learning-eyebrow">PRACTICE · {completed} COMPLETE</span><h3>{skill.quiz ? `Practice ${quizMove}` : challenge.label}</h3><p>{skill.drill}</p><span className="learning-pill"><Zap size={14}/>+{drillReward(completed)} XP this repetition</span><div className="learning-actions">{!skill.quiz && <button className="text-button" onClick={() => setShowDemo(v => !v)}>{showDemo ? 'Hide demonstration' : 'Show me once'}</button>}<button className="text-button" onClick={() => {setVariation(i => i+1);setShowDemo(false);}}>Another case</button></div><div className="skill-bottom-actions"><button className="text-button" onClick={() => {onComplete();setVariation(i => i+1);setShowDemo(false);}}><Check size={16}/>I did it</button><button className="button" disabled={!completed} onClick={onTest}>Take the test</button></div></div></section>;
}
function SkillTest({skill,onPass,onRestart}: {skill:SkillNode;onPass:()=>void;onRestart:()=>void}) {
  const questions = useMemo(() => notationQuestions(skill.quiz === 'slices'),[skill.quiz]);
  const [index,setIndex] = useState(0), [answer,setAnswer] = useState(''), [feedback,setFeedback] = useState(''), [correct,setCorrect] = useState(false);
  const [preview,setPreview] = useState<Cubie[] | null>(null);
  const challenge = skill.cases[index];
  const initial = useMemo(() => challenge ? caseState(challenge.solution) : undefined,[challenge]);
  const total = skill.quiz ? questions.length : skill.cases.length;
  function check(answerValue = answer) {
    try {
      let passed: boolean;
      if (skill.quiz) passed = answerValue === questions[index].answer;
      else {
        const turns = parseLearningMoves(answerValue);
        if (challenge.allowed && turns.some(m => !challenge.allowed!.includes(m[0]))) throw Error('For this Roux step, use only M and U turns.');
        if (skill.id === 'cross-planning' && turns.length > 4) throw Error('For this speed challenge, use four moves or fewer.');
        const end = turns.reduce((s,m) => applyMove(s,m), initial!);
        setPreview(end); passed = goalMet(end,challenge.goal,challenge.target);
      }
      setCorrect(passed); setFeedback(passed ? '' : skill.quiz ? 'Not quite. Judge the direction looking straight at the named face. Try again.' : 'Not yet. Check the target piece and the pieces that must stay solved. You can revise your turns.');
    } catch(e) {setCorrect(false);setFeedback((e as Error).message);}
  }
  function next() {if(index === total-1)onPass();else {setIndex(i => i+1);setAnswer('');setFeedback('');setCorrect(false);setPreview(null);}}
  return <section className="skill-workspace card"><div>{skill.quiz ? <div className="notation-question"><span>READ THE MOVE</span><strong>{questions[index].move}</strong><small>Viewed straight at the named face</small></div> : <LearningCube key={`${index}:${preview ? 'preview' : 'start'}`} moves={noMoves} initialState={preview ?? initial} target={challenge.target ? [challenge.target] : undefined}/>}</div><div className="skill-instruction"><span className="learning-eyebrow">TEST · {index+1} / {total}</span><h3>{skill.quiz ? 'Which turn is this?' : challenge.label}</h3><p>{skill.quiz ? 'Choose the face and direction.' : 'Enter moves to reach the goal. Any valid solution counts.'}</p>
    {skill.quiz ? <div className="quiz-options">{questions[index].options.map(option => <button key={option} disabled={correct} onClick={() => {setAnswer(option);check(option);}} className={answer === option ? correct ? 'correct' : 'incorrect' : ''}><span>{option}</span><span className="quiz-answer-mark" aria-hidden="true">{answer === option && correct && <Check size={20}/>}</span></button>)}</div> : <form className="move-answer" onSubmit={e => {e.preventDefault();if(correct)next();else check();}}><label htmlFor="skill-answer">Your moves</label><input id="skill-answer" autoComplete="off" spellCheck={false} placeholder="e.g. R U R′" value={answer} disabled={correct} onChange={e => {setAnswer(e.target.value);setCorrect(false);setFeedback('');setPreview(null);}}/><div className="move-pad" aria-label="Add a turn">{(challenge.allowed ? ['M',"M'",'M2','U',"U'",'U2'] : ['R',"R'",'R2','L',"L'",'L2','U',"U'",'U2','F',"F'",'F2','B',"B'",'B2','D',"D'",'D2']).map(move => <button key={move} type="button" title={moveDescription(move)} disabled={correct} onClick={() => {setAnswer(s => `${s} ${move}`.trim());setPreview(null);setFeedback('');}}>{move}</button>)}</div><div className="skill-bottom-actions"><button className="icon-button" type="button" aria-label="Restart test" onClick={onRestart}><RotateCcw size={20}/></button><button className="button" type="submit" disabled={!correct && !answer.trim()}>{correct ? index === total-1 ? 'Complete test' : 'Next challenge' : 'Check answer'}</button></div></form>}
    <span className="learning-answer-status" role="status">{correct ? 'Answer accepted. Continue when ready.' : ''}</span>
    {feedback && !correct && <p className="test-feedback" role="alert">{feedback}</p>}
    {skill.quiz && <div className="skill-bottom-actions"><button className="icon-button" aria-label="Restart test" onClick={onRestart}><RotateCcw size={20}/></button><button className="button" disabled={!correct} onClick={next}>{index === total-1 ? 'Complete test' : 'Next challenge'}</button></div>}

  </div></section>;
}

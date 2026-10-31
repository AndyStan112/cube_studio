import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, GitBranch, LockKeyhole, Sparkles, Trophy, Zap } from 'lucide-react';
import { applyMove, inverse, type Cubie } from '../lib/cube';
import { skills, trees, availableSkill, prerequisitesMet, type MethodId, type SkillNode } from '../lib/curriculum';
import { blankSkill, drillReward, levelInfo, type LearningAction, type LearningProgress } from '../lib/learning';
import { caseState, goalMet, parseLearningMoves } from '../lib/learningGoals';
import { notationQuestions } from '../lib/learningQuiz';
import { moveDescription } from '../lib/teaching';
import LearningCube from './LearningCube';
import './LearningPage.css';
type Props = { progress: LearningProgress; award: (action: LearningAction) => number };
type Phase = 'lesson' | 'drill' | 'test';
const noMoves: string[] = [];
export default function LearningPage({ progress, award }: Props) {
  const [method, setMethod] = useState<MethodId>('beginner');
  const [selected, setSelected] = useState<string | null>(null);
  const [activity, setActivity] = useState(false);
  useEffect(() => { window.scrollTo({top:0,behavior:'instant'}); }, [selected,method]);
  const tree = trees[method], level = levelInfo(progress.xp);
  const continueNode = tree.nodes.find(n => n.kind === 'core' && !progress.skills[n.id]?.passed && !(n.id === 'loading-spot' && progress.skills['two-lines']?.passed) && prerequisitesMet(method,n.id,progress));
  if (selected) return <SkillFlow key={`${method}:${selected}`} skill={skills[selected]} method={method} progress={progress} award={award} onBack={() => setSelected(null)} />;
  return <div className="learning-shell">
    <section className="learning-hero"><div><span className="learning-eyebrow"><Sparkles size={15}/> YOUR NEXT BREAKTHROUGH · 3×3</span><h2>One skill at a time.</h2><p>See it. Try it. Make it yours.</p></div><div className="level-card"><span className="level-orb">{level.level}</span><div><strong>Level {level.level}</strong><span>{level.current} / {level.needed} XP to level {level.level+1}</span><div className="xp-track" role="progressbar" aria-label="Level progress" aria-valuenow={level.current} aria-valuemin={0} aria-valuemax={level.needed}><i style={{width:`${level.fraction*100}%`}}/></div></div></div></section>
    <div className="learning-toolbar"><div className="method-switch" aria-label="Learning method">{(['beginner','roux'] as const).map(id => <button key={id} aria-pressed={method === id} onClick={() => setMethod(id)}>{trees[id].title}</button>)}</div><button className="text-button" aria-expanded={activity} onClick={() => setActivity(v => !v)}><Zap size={15}/>{progress.xp.toLocaleString()} XP · Activity</button></div>
    {activity && <XPActivity progress={progress}/>}
    <section className="tree-intro"><div><h3>{tree.title} path</h3><p>{tree.description}</p></div>{continueNode ? <button className="button" onClick={() => setSelected(continueNode.id)}>Continue <ArrowRight size={16}/></button> : <span className="learning-pill"><Trophy size={15}/> Path complete</span>}</section>
    <div className="tree-legend"><span><i className="legend-core"/>Core skill</span><span><i className="legend-speed"/>Speed upgrade · optional</span><span><GitBranch size={13}/>Shared skills carry over</span></div>
    <div className="skill-tree" aria-label={`${tree.title} skill tree`}>
      {tree.nodes.filter(n => n.kind === 'core').map((node,index) => {
        const render = (id: string, branch = false) => {
          const entry = tree.nodes.find(n => n.id === id)!, skill = skills[id], passed = progress.skills[id]?.passed, unlocked = availableSkill(method,id,progress);
          const shared = Object.values(trees).filter(t => t.nodes.some(n => n.id === id)).length > 1;
          return <button className={`skill-node ${branch ? 'skill-branch' : ''} ${passed ? 'is-mastered' : unlocked ? 'is-available' : 'is-locked'} ${entry.kind === 'speed' ? 'is-speed' : ''}`} disabled={!unlocked} onClick={() => setSelected(id)}>
            <span className="skill-status">{passed ? <Check size={20}/> : unlocked ? <span>{index+1}</span> : <LockKeyhole size={18}/>}</span><span className="skill-copy"><span className="skill-meta">{id === 'loading-spot' ? 'Choose a route · recommended' : entry.kind === 'alternative' ? 'Choose a route · alternative' : entry.kind === 'speed' ? 'Optional speed upgrade' : 'Core skill'}{shared && <GitBranch size={12} aria-label="Shared skill"/>}</span><strong>{skill.title}</strong><small>{passed ? 'Test passed · revisit anytime' : skill.subtitle}</small></span><ChevronRight size={18}/>
          </button>;
        };
        return <div className="skill-tree-row" key={node.id}><div className="skill-main">{render(node.id)}</div><div className="skill-branches">{tree.nodes.filter(n => n.kind !== 'core' && n.requires.some(g => g.includes(node.id))).map(n => <div key={n.id}>{render(n.id,true)}</div>)}</div></div>;
      })}
    </div><p className="learning-footnote">Pass a test to unlock the next skill. Drill anytime—even after passing. Progress is saved for this profile on this device.</p>
  </div>;
}
function XPActivity({progress}: {progress:LearningProgress}) {
  const labels = {lesson:'Lessons',drill:'Drills',test:'Tests',timer:'Timer solves',legacy:'Earlier XP'};
  return <section className="xp-activity card" aria-label="XP activity"><h3>Where your XP comes from</h3><div className="xp-sources">{(['lesson','drill','test','timer'] as const).map(source => <div key={source}><span>{labels[source]}</span><strong>{progress.ledger.filter(e => e.source === source).reduce((sum,e) => sum+e.amount,0)} XP</strong></div>)}</div>{progress.ledger.length ? <ol>{progress.ledger.slice(-8).reverse().map(event => <li key={event.id}><span>{event.skillId ? skills[event.skillId]?.title ?? event.skillId : labels[event.source]}<small>{event.source}{event.repeat ? ' · repeat' : ''}{event.method ? ` · ${event.method}` : ''} · {new Date(event.createdAt).toLocaleString()}</small></span><strong>+{event.amount} XP</strong></li>)}</ol> : <p>Your first lesson starts the story.</p>}</section>;
}
function SkillFlow({skill,method,progress,award,onBack}: Props & {skill:SkillNode;method:MethodId;onBack:()=>void}) {
  const status = progress.skills[skill.id] ?? blankSkill();
  const [phase,setPhase] = useState<Phase>('lesson');
  const [slide,setSlide] = useState(0);
  const [notice,setNotice] = useState('');
  const [celebration,setCelebration] = useState(false);
  const [testAttempt,setTestAttempt] = useState(0);
  useEffect(() => { window.scrollTo({top:0,behavior:'instant'}); }, [phase,slide,celebration]);
  const grant = (type:'lesson'|'drill'|'test') => { const amount = award({type,skill:skill.id,method,event:'333'}); setNotice(amount ? `+${amount} XP${type === 'test' ? ' · Skill mastered!' : ''}` : type === 'test' ? 'Test passed again. Nice work.' : 'Already completed. Keep practicing!'); return amount; };
  return <div className="learning-shell skill-flow"><button className="text-button" onClick={onBack}><ArrowLeft size={16}/> {trees[method].title} tree</button><header className="skill-flow-heading"><div><span className="learning-eyebrow">{status.passed ? 'MASTERED · KEEP IT FRESH' : 'YOUR NEXT SKILL'}</span><h2>{skill.title}</h2><p>{skill.subtitle}</p></div><span className="learning-pill">{status.passed ? <Check size={15}/> : <Trophy size={15}/>} {status.passed ? 'Test passed' : '150 XP first pass'}</span></header>
    <nav className="skill-phases" aria-label="Skill steps">{(['lesson','drill','test'] as const).map((value,index) => <button key={value} aria-current={phase === value ? 'step' : undefined} disabled={value === 'drill' && !status.lesson || value === 'test' && (!status.lesson || !status.drills)} onClick={() => {setPhase(value);setNotice('');setCelebration(false);}}><span>{value === 'lesson' && status.lesson || value === 'drill' && status.drills || value === 'test' && status.passed ? <Check size={14}/> : index+1}</span>{value === 'drill' ? 'Exercises' : value === 'test' ? 'Test' : 'Lesson'}</button>)}</nav>
    {notice && <div className="xp-notice" role="status"><Sparkles size={17}/>{notice}</div>}
    {celebration ? <section className="skill-celebration card"><span className="celebration-icon"><Trophy size={38}/></span><h3>You’ve got this.</h3><p>{skill.title} is complete in every tree that uses it.</p><div className="learning-actions"><button className="button" onClick={onBack}>Back to your path <ArrowRight size={16}/></button><button className="text-button" onClick={() => {setCelebration(false);setPhase('drill');}}>Keep drilling · +{drillReward(status.drills)} XP</button></div></section> : phase === 'lesson' ? <section className="skill-workspace card"><LearningCube key={`${skill.id}:${slide}`} {...skill.slides[slide]} autoPlay label={skill.slides[slide].title}/><div className="skill-instruction"><span className="learning-eyebrow">{slide+1} / {skill.slides.length} · VISUAL LESSON</span><h3>{skill.slides[slide].title}</h3><p>{skill.slides[slide].text}</p><div className="slide-dots" aria-label="Lesson slides">{skill.slides.map((s,i) => <button key={i} aria-label={`Slide ${i+1}: ${s.title}`} aria-current={slide === i ? 'step' : undefined} onClick={() => setSlide(i)}/>)}</div><div className="learning-actions"><button className="icon-button" aria-label="Previous slide" disabled={!slide} onClick={() => setSlide(i => i-1)}><ArrowLeft size={18}/></button><button className="button" onClick={() => {if(slide < skill.slides.length-1)setSlide(i => i+1);else {grant('lesson');setPhase('drill');}}}>{slide < skill.slides.length-1 ? 'Next' : status.lesson ? 'Go to exercises' : 'Finish lesson · +25 XP'}<ArrowRight size={16}/></button></div></div></section> : phase === 'drill' ? <DrillPanel skill={skill} completed={status.drills} onComplete={() => grant('drill')} onTest={() => {setNotice('');setPhase('test');}}/> : <SkillTest key={testAttempt} skill={skill} onRestart={() => {setTestAttempt(n => n+1);setNotice('');}} onPass={() => {grant('test');setCelebration(true);}}/>}
  </div>;
}
function DrillPanel({skill,completed,onComplete,onTest}: {skill:SkillNode;completed:number;onComplete:()=>void;onTest:()=>void}) {
  const [variation,setVariation] = useState(completed % Math.max(1,skill.cases.length));
  const [showDemo,setShowDemo] = useState(false);
  const challenge = skill.cases[variation % skill.cases.length];
  const quizMove = (skill.quiz === 'slices' ? ['M',"M'",'M2','U',"U'",'U2'] : ['R',"F'",'U2','L',"B'",'D2'])[variation % 6];
  const state = useMemo(() => challenge ? caseState(challenge.solution) : undefined,[challenge]);
  return <section className="skill-workspace card"><div><LearningCube key={`${variation}:${showDemo}`} moves={skill.quiz ? [quizMove] : showDemo ? challenge.solution : noMoves} initialState={skill.quiz ? undefined : state} startSolved={!!skill.quiz} autoPlay={!!skill.quiz || showDemo} target={challenge?.target ? [challenge.target] : undefined}/>{!skill.quiz && <details className="physical-setup"><summary>Set up this case on your own cube</summary><p>Start solved, yellow up and red front.</p><code>{inverse(challenge.solution).join(' ')}</code></details>}</div><div className="skill-instruction"><span className="learning-eyebrow">REPEATABLE EXERCISE · {completed} DONE</span><h3>{skill.quiz ? `Practice ${quizMove}` : challenge.label}</h3><p>{skill.drill}</p><span className="learning-pill"><Zap size={14}/>+{drillReward(completed)} XP this repetition</span><div className="learning-actions"><button className="button" onClick={() => {onComplete();setVariation(i => i+1);setShowDemo(false);}}><Check size={16}/>I did it</button>{!skill.quiz && <button className="text-button" onClick={() => setShowDemo(v => !v)}>{showDemo ? 'Hide demonstration' : 'Show me once'}</button>}<button className="text-button" onClick={() => {setVariation(i => i+1);setShowDemo(false);}}>Another case</button></div><p className="exercise-trust">Your word is enough here. The test will check your understanding.</p><button className="text-button" disabled={!completed} onClick={onTest}>Ready for the test <ArrowRight size={15}/></button></div></section>;
}
function SkillTest({skill,onPass,onRestart}: {skill:SkillNode;onPass:()=>void;onRestart:()=>void}) {
  const questions = useMemo(() => notationQuestions(skill.quiz === 'slices'),[skill.quiz]);
  const [index,setIndex] = useState(0), [answer,setAnswer] = useState(''), [feedback,setFeedback] = useState(''), [correct,setCorrect] = useState(false);
  const [preview,setPreview] = useState<Cubie[] | null>(null);
  const challenge = skill.cases[index];
  const initial = useMemo(() => challenge ? caseState(challenge.solution) : undefined,[challenge]);
  const total = skill.quiz ? questions.length : skill.cases.length;
  useEffect(() => { window.scrollTo({top:0,behavior:'instant'}); }, [index]);
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
      setCorrect(passed); setFeedback(passed ? 'That’s it. Goal reached.' : skill.quiz ? 'Not quite. Judge the direction looking straight at the named face. Try again.' : 'Not yet. Check the target piece and the pieces that must stay solved. You can revise your turns.');
    } catch(e) {setCorrect(false);setFeedback((e as Error).message);}
  }
  function next() {if(index === total-1)onPass();else {setIndex(i => i+1);setAnswer('');setFeedback('');setCorrect(false);setPreview(null);}}
  return <section className="skill-workspace card"><div>{skill.quiz ? <div className="notation-question"><span>READ THE MOVE</span><strong>{questions[index].move}</strong><small>Viewed straight at the named face</small></div> : <LearningCube key={`${index}:${preview ? 'preview' : 'start'}`} moves={noMoves} initialState={preview ?? initial} target={challenge.target ? [challenge.target] : undefined}/>}</div><div className="skill-instruction"><span className="learning-eyebrow">TEST · {index+1} / {total}</span><h3>{skill.quiz ? 'Which turn is this?' : challenge.label}</h3><p>{skill.quiz ? 'Choose the face and direction. Get every question right to finish.' : 'Write the moves you would make. We check where the pieces end up, so another valid solution works too.'}</p>
    {skill.quiz ? <div className="quiz-options">{questions[index].options.map(option => <button key={option} disabled={correct} onClick={() => {setAnswer(option);check(option);}} className={answer === option ? correct ? 'correct' : 'incorrect' : ''}>{option}</button>)}</div> : <form className="move-answer" onSubmit={e => {e.preventDefault();check();}}><label htmlFor="skill-answer">Your moves</label><input id="skill-answer" autoComplete="off" spellCheck={false} placeholder="e.g. R U R′" value={answer} disabled={correct} onChange={e => {setAnswer(e.target.value);setCorrect(false);setFeedback('');setPreview(null);}}/><div className="move-pad" aria-label="Add a turn">{(challenge.allowed ? ['M',"M'",'M2','U',"U'",'U2'] : ['R',"R'",'R2','L',"L'",'L2','U',"U'",'U2','F',"F'",'F2','B',"B'",'B2','D',"D'",'D2']).map(move => <button key={move} type="button" title={moveDescription(move)} disabled={correct} onClick={() => {setAnswer(s => `${s} ${move}`.trim());setPreview(null);setFeedback('');}}>{move}</button>)}</div><button className="button" disabled={correct || !answer.trim()}>Try these moves <ArrowRight size={15}/></button></form>}
    {feedback && <p className={`test-feedback ${correct ? 'correct' : ''}`} role="status">{feedback}</p>}{correct && <button className="button" onClick={next}>{index === total-1 ? 'Complete test' : 'Next challenge'}<ArrowRight size={16}/></button>}
    <button className="text-button test-restart" onClick={onRestart}>Restart test</button>
  </div></section>;
}

import {
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentRef,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { DoubleSide, Group, Quaternion } from "three";
import { algorithmStates, moveInfo } from "../lib/cube";
const colors = [
  "#6297ed",
  "#65b99a",
  "#f5d54f",
  "#f5f5eb",
  "#e9574e",
  "#ff9c39",
];
// Box face order: right, left, up, down, front, back.
const faces = [
  { position: [0.501, 0, 0], rotation: [0, Math.PI / 2, 0] },
  { position: [-0.501, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  { position: [0, 0.501, 0], rotation: [-Math.PI / 2, 0, 0] },
  { position: [0, -0.501, 0], rotation: [Math.PI / 2, 0, 0] },
  { position: [0, 0, 0.501], rotation: [0, 0, 0] },
  { position: [0, 0, -0.501], rotation: [0, Math.PI, 0] },
] satisfies {
  position: [number, number, number];
  rotation: [number, number, number];
}[];
function Model({
  moves,
  step,
  transparent,
}: {
  moves: string[];
  step: number;
  transparent: boolean;
}) {
  const states = useMemo(() => algorithmStates(moves), [moves]);
  const refs = useRef<(Group | null)[]>([]),
    progress = useRef(0);
  useFrame((_, dt) => {
    const delta = step - progress.current;
    progress.current =
      Math.abs(delta) < 0.008
        ? step
        : progress.current +
          Math.sign(delta) * Math.min(Math.abs(delta), dt * 2.8);
    const base = Math.min(Math.floor(progress.current), moves.length),
      fraction = progress.current - base;
    const info = base < moves.length ? moveInfo(moves[base]) : null;
    const q = info
      ? new Quaternion().setFromAxisAngle(info.vector, info.angle * fraction)
      : new Quaternion();
    states[base].forEach((c, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      mesh.position.copy(c.position);
      mesh.quaternion.copy(c.rotation);
      if (info && Math.round(c.position[info.axis]) === info.layer) {
        mesh.position.applyQuaternion(q);
        mesh.quaternion.premultiply(q);
      }
    });
  });
  return (
    <group>
      {states[0].map((c, i) => (
        <group
          key={c.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          scale={0.94}
        >
          {!transparent && (
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#202c29" roughness={0.5} />
            </mesh>
          )}
          {colors.map((color, face) => {
            const exterior = [
              c.home[0] === 1,
              c.home[0] === -1,
              c.home[1] === 1,
              c.home[1] === -1,
              c.home[2] === 1,
              c.home[2] === -1,
            ][face];
            if (!exterior) return null;
            return (
              <mesh
                key={face}
                position={faces[face].position}
                rotation={faces[face].rotation}
              >
                <planeGeometry args={[0.9, 0.9]} />
                <meshStandardMaterial
                  color={color}
                  roughness={0.36}
                  metalness={0.05}
                  side={DoubleSide}
                  transparent={transparent}
                  opacity={transparent ? 0.35 : 1}
                  depthWrite={!transparent}
                />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}
const defaultView: [number, number, number] = [5, 4.3, 5];
function CameraControls({ resetView }: { resetView: number }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  useLayoutEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    // Flush drag momentum before reset so damping cannot shift the saved view.
    const damping = orbit.enableDamping;
    orbit.enableDamping = false;
    orbit.update();
    orbit.reset();
    orbit.enableDamping = damping;
  }, [resetView]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      minDistance={5}
      maxDistance={14}
    />
  );
}
export default function Cube({
  moves,
  step,
  transparent,
  resetView,
}: {
  moves: string[];
  step: number;
  transparent: boolean;
  resetView: number;
}) {
  return (
    <Canvas
      camera={{ position: defaultView, fov: 38 }}
      dpr={[1, 2]}
      fallback={<p>3D needs a browser with WebGL support.</p>}
    >
      <ambientLight intensity={1.6} />
      <directionalLight position={[4, 8, 5]} intensity={2.5} />
      <Suspense fallback={null}>
        <Model moves={moves} step={step} transparent={transparent} />
      </Suspense>
      <CameraControls resetView={resetView} />
    </Canvas>
  );
}

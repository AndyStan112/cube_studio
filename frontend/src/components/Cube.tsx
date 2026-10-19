import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Mesh, Quaternion, Vector3 } from "three";
import { algorithmStates, moveInfo } from "../lib/cube";
const colors = [
  "#e9574e",
  "#ff9c39",
  "#f5d54f",
  "#f5f5eb",
  "#65b99a",
  "#6297ed",
];
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
  const refs = useRef<(Mesh | null)[]>([]),
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
        <mesh
          key={c.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          scale={0.94}
        >
          <boxGeometry args={[1, 1, 1]} />
          {colors.map((color, face) => {
            const exterior = [
              c.home[0] === 1,
              c.home[0] === -1,
              c.home[1] === 1,
              c.home[1] === -1,
              c.home[2] === 1,
              c.home[2] === -1,
            ][face];
            return (
              <meshStandardMaterial
                key={face}
                attach={`material-${face}`}
                color={exterior ? color : "#202c29"}
                roughness={0.36}
                metalness={0.05}
                transparent={transparent}
                opacity={transparent ? (exterior ? 0.48 : 0.07) : 1}
                depthWrite={!transparent}
              />
            );
          })}
        </mesh>
      ))}
    </group>
  );
}
const views: [number, number, number][] = [
  [5, 4.3, 5],
  [-5, 4.3, 5],
  [0.01, 7, 0],
  [5, 3, -5],
];
function Camera({ angle }: { angle: number }) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.copy(new Vector3(...views[angle]));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [angle, camera]);
  return null;
}
export default function Cube({
  moves,
  step,
  transparent,
  angle,
}: {
  moves: string[];
  step: number;
  transparent: boolean;
  angle: number;
}) {
  return (
    <Canvas
      camera={{ position: views[0], fov: 38 }}
      dpr={[1, 2]}
      fallback={<p>3D needs a browser with WebGL support.</p>}
    >
      <ambientLight intensity={1.6} />
      <directionalLight position={[4, 8, 5]} intensity={2.5} />
      <Suspense fallback={null}>
        <Model moves={moves} step={step} transparent={transparent} />
      </Suspense>
      <Camera angle={angle} />
      <OrbitControls
        key={angle}
        makeDefault
        enablePan={false}
        minDistance={5}
        maxDistance={14}
      />
    </Canvas>
  );
}

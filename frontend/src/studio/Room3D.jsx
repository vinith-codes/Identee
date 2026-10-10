// studio/Room3D.jsx
//
// The 3D "Design Room": a warm studio with the chosen tee floating in the
// centre. Each print area is a decal (DecalGeometry) pressed onto the tee at
// its true physical size; its picture comes from the area's Konva render.
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, forwardRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, MeshReflectorMaterial, OrbitControls, Sparkles, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { areaCentreRaw } from "./teeModel";

const TEE_SCALE = 2.2; // model metres → room units
const TEE_Y = 0.18;
const ORBIT_TARGET = [0, 0.1, 0]; // constant so re-renders never reset the camera target
const VIEWS = {
  front: [0, 0.3, 4.3],
  back: [0, 0.3, -4.3],
  left: [4.0, 0.3, 0.3],
  right: [-4.0, 0.3, 0.3],
};
const RAY = {
  front: { origin: (p) => new THREE.Vector3(p.x, p.y, 2), dir: new THREE.Vector3(0, 0, -1) },
  back: { origin: (p) => new THREE.Vector3(p.x, p.y, -2), dir: new THREE.Vector3(0, 0, 1) },
  left: { origin: (p) => new THREE.Vector3(2, p.y, p.z), dir: new THREE.Vector3(-1, 0, 0) },
  right: { origin: (p) => new THREE.Vector3(-2, p.y, p.z), dir: new THREE.Vector3(1, 0, 0) },
};

/* ---------- the sets ----------
   "studio": the bright room you design in.
   "boutique": the Review step's dressing room — dark walls, a lit arch, a
   clothes rack on each side and the designed tee floating in the middle.
   Both stay mounted; only one is visible. (Mockup pictures are always taken
   in the studio, see snapshot.) */
const SETS = {
  studio: { background: "#EDE3D0", fog: [6, 12] },
  boutique: { background: "#191512", fog: [9, 20] },
};
// the tee in the Review step: which way it faces for each side picture
const FACE = { front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };

function Backdrop({ room }) {
  const scene = useThree((st) => st.scene);
  useLayoutEffect(() => {
    paintBackdrop(scene, room);
  }, [scene, room]);
  return null;
}
// Sets the scene's reflections; returns what was there before.
function swapEnvironment(scene, env) {
  const before = scene.environment;
  scene.environment = env;
  return before;
}
function paintBackdrop(scene, room) {
  const set = SETS[room];
  scene.background = new THREE.Color(set.background);
  scene.fog = new THREE.Fog(set.background, ...set.fog);
}

function Studio({ visible }) {
  return (
    <group name="set-studio" visible={visible}>
      <hemisphereLight args={["#FFF7E8", "#C9B48E", 1.1]} />
      <spotLight position={[2.2, 4.2, 3.4]} angle={Math.PI / 7} penumbra={0.55} decay={1.6} distance={14} intensity={70} color="#FFF1D6" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} />
      <directionalLight position={[-3, 2, 2.5]} intensity={0.7} color="#E9F0FF" />
      <directionalLight position={[0, 2.5, -3]} intensity={1.2} color="#FFE3A8" />
      {/* soft fill for the back of the tee */}
      <directionalLight position={[1.5, 1.8, -3.5]} intensity={1.6} color="#FFF4E2" />
      <mesh position={[0, 2.2, -1.2]}>
        <cylinderGeometry args={[6, 6, 6, 64, 1, true, Math.PI * 0.75, Math.PI * 1.5]} />
        <meshStandardMaterial color="#EADFC9" roughness={1} side={THREE.BackSide} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.8} receiveShadow>
        <circleGeometry args={[9, 64]} />
        <meshStandardMaterial color="#E4D7BE" roughness={0.95} />
      </mesh>
      <mesh position-y={-0.74} receiveShadow castShadow>
        <cylinderGeometry args={[0.75, 0.8, 0.12, 64]} />
        <meshStandardMaterial color="#F4EDE0" roughness={0.6} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position-y={-0.68}>
        <torusGeometry args={[0.775, 0.012, 12, 96]} />
        <meshStandardMaterial color="#C9A24B" metalness={0.9} roughness={0.25} />
      </mesh>
    </group>
  );
}

const RACK_TEES = ["#15130F", "#EFE7D6", "#5A1F2B", "#4A5A3A", "#1F2A44", "#C9B48E", "#B9A8D6", "#8C3B2A"];
const BRASS = { color: "#C39A45", metalness: 1, roughness: 0.22 };
const FLOOR_Y = -0.8;
const WALL_Z = -4.4;

// A clothes rail with tees hanging on it (the same tee shape, plain colours).
// The tees sway a little, as if someone just walked past.
function Rack({ geo, position, turn, colours }) {
  const RAIL = 1.42;
  const hung = useRef([]);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    hung.current.forEach((g, i) => {
      if (g) g.rotation.z = Math.sin(t * 0.7 + i * 1.3) * 0.018;
    });
  });
  return (
    <group position={position} rotation-y={turn}>
      <mesh position-y={RAIL} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.022, 0.022, 2.3, 16]} />
        <meshStandardMaterial {...BRASS} />
      </mesh>
      {[-1.05, 1.05].map((x) => (
        <group key={x} position-x={x}>
          <mesh position-y={(RAIL + FLOOR_Y) / 2}>
            <cylinderGeometry args={[0.02, 0.02, RAIL - FLOOR_Y, 12]} />
            <meshStandardMaterial {...BRASS} />
          </mesh>
          <mesh position-y={FLOOR_Y + 0.02} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.02, 0.02, 0.7, 12]} />
            <meshStandardMaterial {...BRASS} />
          </mesh>
          <mesh position-y={RAIL + 0.03}>
            <sphereGeometry args={[0.04, 16, 12]} />
            <meshStandardMaterial {...BRASS} />
          </mesh>
        </group>
      ))}
      {colours.map((c, i) => {
        const x = -0.82 + (i * 1.64) / Math.max(1, colours.length - 1);
        return (
          <group key={c} position={[x, RAIL, 0]} rotation-y={Math.PI / 2 + (i % 2 ? 0.14 : -0.1)} ref={(g) => (hung.current[i] = g)}>
            {/* hanger: hook and shoulders */}
            <mesh position-y={-0.08}>
              <cylinderGeometry args={[0.008, 0.008, 0.16, 8]} />
              <meshStandardMaterial {...BRASS} />
            </mesh>
            <mesh position-y={-0.17} rotation-z={Math.PI / 2}>
              <cylinderGeometry args={[0.012, 0.012, 0.62, 8]} />
              <meshStandardMaterial color="#2A211A" roughness={0.6} />
            </mesh>
            <mesh geometry={geo} scale={1.95} position-y={-0.98}>
              <meshStandardMaterial color={c} roughness={0.95} side={THREE.DoubleSide} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// A wall shelf with stacks of folded tees and a light strip under it.
function Shelf({ position, colours }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[1.9, 0.05, 0.42]} />
        <meshStandardMaterial color="#4A382B" roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.04, 0.16]}>
        <boxGeometry args={[1.8, 0.015, 0.03]} />
        <meshBasicMaterial color="#FFE2B0" toneMapped={false} />
      </mesh>
      {colours.map((stack, i) => (
        <group key={i} position={[-0.62 + i * 0.62, 0.03, 0]}>
          {stack.map((c, k) => (
            <mesh key={k} position-y={0.035 + k * 0.062}>
              <boxGeometry args={[0.44 - k * 0.006, 0.055, 0.32]} />
              <meshStandardMaterial color={c} roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// A hanging globe lamp.
function Pendant({ position }) {
  return (
    <group position={position}>
      <mesh position-y={1.5}>
        <cylinderGeometry args={[0.006, 0.006, 3, 6]} />
        <meshBasicMaterial color="#0E0C0A" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.13, 24, 16]} />
        <meshBasicMaterial color="#FFE7BE" toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.24, 24, 16]} />
        <meshBasicMaterial color="#FFCF8A" transparent opacity={0.13} depthWrite={false} />
      </mesh>
      <pointLight intensity={5} distance={5} decay={1.7} color="#FFD9A8" />
    </group>
  );
}

// The shop's name over the arch, drawn once onto a small picture.
function useSign(text) {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 160;
    const x = c.getContext("2d");
    x.fillStyle = "#F3D9A4";
    x.font = '800 92px "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif';
    x.textBaseline = "middle";
    const gap = 34;
    const widths = [...text].map((ch) => x.measureText(ch).width);
    let at = (c.width - (widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1))) / 2;
    [...text].forEach((ch, i) => {
      x.fillText(ch, at, 84);
      at += widths[i] + gap;
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [text]);
}

function Boutique({ visible, model }) {
  const { geo } = useTeeGeometry(model.url);
  const sign = useSign("IDENTEE");
  // wooden slats across the back wall (left clear around the arch)
  const slats = useMemo(() => {
    const out = [];
    for (let x = -7; x <= 7; x += 0.21) if (Math.abs(x) > 1.42) out.push(x);
    return out;
  }, []);
  const slatRef = useRef();
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    slats.forEach((x, i) => slatRef.current?.setMatrixAt(i, m.makeTranslation(x, 2, WALL_Z + 0.05)));
    if (slatRef.current) slatRef.current.instanceMatrix.needsUpdate = true;
  }, [slats]);

  return (
    <group name="set-boutique" visible={visible}>
      {/* soft reflections for the brass and the glossy floor (made in the scene, nothing is downloaded) */}
      {visible && (
        <Environment resolution={128} frames={1}>
          <color attach="background" args={["#0C0A08"]} />
          <Lightformer form="rect" intensity={5} color="#FFE6BF" position={[0, 5, 2]} rotation-x={Math.PI / 2} scale={[8, 3, 1]} />
          <Lightformer form="rect" intensity={2.2} color="#FFD49A" position={[-6, 2, 1]} rotation-y={Math.PI / 2} scale={[5, 3, 1]} />
          <Lightformer form="rect" intensity={2.2} color="#FFD49A" position={[6, 2, 1]} rotation-y={-Math.PI / 2} scale={[5, 3, 1]} />
          <Lightformer form="rect" intensity={3} color="#FFF1D8" position={[0, 1.5, -6]} scale={[3, 4, 1]} />
        </Environment>
      )}
      <hemisphereLight args={["#FFE9C8", "#1E1712", 0.28]} />
      {/* the key light on the designed tee */}
      <spotLight position={[1.2, 4.8, 4.2]} angle={Math.PI / 8.5} penumbra={0.75} decay={1.5} distance={16} intensity={120} color="#FFF0D8" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} />
      <directionalLight position={[-3.5, 2.2, 3]} intensity={0.7} color="#FFE7C7" />
      {/* rim light from behind, so the tee stands off the wall */}
      <directionalLight position={[0, 2.6, -4]} intensity={2.4} color="#FFD9A0" />

      {/* polished floor that mirrors the room */}
      <mesh rotation-x={-Math.PI / 2} position-y={FLOOR_Y} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <MeshReflectorMaterial color="#1E1712" roughness={0.6} metalness={0.25} mirror={0.55} mixStrength={2.4} mixBlur={1.4} blur={[280, 90]} resolution={512} depthScale={0.6} minDepthThreshold={0.4} maxDepthThreshold={1.3} />
      </mesh>
      {/* the tee's spot: a low round plinth with a ring of light */}
      <mesh position-y={FLOOR_Y + 0.035} receiveShadow castShadow>
        <cylinderGeometry args={[1.1, 1.16, 0.07, 72]} />
        <meshStandardMaterial color="#A3957C" roughness={0.9} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position-y={FLOOR_Y + 0.012}>
        <torusGeometry args={[1.2, 0.018, 10, 120]} />
        <meshBasicMaterial color="#FFDFA6" toneMapped={false} />
      </mesh>
      <pointLight position={[0, FLOOR_Y + 0.25, 0]} intensity={3} distance={3} decay={2} color="#FFDFA6" />

      {/* walls: dark plaster with wooden slats */}
      <mesh position={[0, 2.4, WALL_Z]}>
        <planeGeometry args={[30, 8]} />
        <meshStandardMaterial color="#17120F" roughness={1} />
      </mesh>
      <instancedMesh ref={slatRef} args={[null, null, slats.length]}>
        <boxGeometry args={[0.1, 6, 0.06]} />
        <meshStandardMaterial color="#3D2D22" roughness={0.75} />
      </instancedMesh>
      <mesh position={[-6.6, 2.4, 0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[14, 8]} />
        <meshStandardMaterial color="#1B1612" roughness={1} />
      </mesh>
      <mesh position={[6.6, 2.4, 0]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[14, 8]} />
        <meshStandardMaterial color="#1B1612" roughness={1} />
      </mesh>

      {/* the lit arch behind the tee, framed in brass, with the shop's name over it */}
      <group position={[0, 0, WALL_Z + 0.04]}>
        <mesh position={[0, 0.35, -0.01]}>
          <planeGeometry args={[2.5, 2.3]} />
          <meshStandardMaterial {...BRASS} />
        </mesh>
        <mesh position={[0, 1.5, -0.01]}>
          <circleGeometry args={[1.25, 64, 0, Math.PI]} />
          <meshStandardMaterial {...BRASS} />
        </mesh>
        <mesh position-y={0.35}>
          <planeGeometry args={[2.32, 2.3]} />
          <meshBasicMaterial color="#F4E2BD" toneMapped={false} />
        </mesh>
        <mesh position-y={1.5}>
          <circleGeometry args={[1.16, 64, 0, Math.PI]} />
          <meshBasicMaterial color="#F4E2BD" toneMapped={false} />
        </mesh>
        {/* light strips beside the arch */}
        {[-1.36, 1.36].map((x) => (
          <mesh key={x} position={[x, 0.75, 0.05]}>
            <boxGeometry args={[0.025, 3.1, 0.02]} />
            <meshBasicMaterial color="#FFDFA6" toneMapped={false} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 3.08, WALL_Z + 0.12]}>
        <planeGeometry args={[2.2, 0.34]} />
        <meshBasicMaterial map={sign} transparent toneMapped={false} />
      </mesh>

      {/* a clothes rack on each side, with a lamp over each */}
      <Rack geo={geo} position={[-2.8, 0, -1.9]} turn={0.5} colours={RACK_TEES.slice(0, 6)} />
      <Rack geo={geo} position={[2.8, 0, -1.9]} turn={-0.5} colours={[...RACK_TEES.slice(3), ...RACK_TEES.slice(0, 1)]} />
      <Pendant position={[-1.8, 2.3, -2.6]} />
      <Pendant position={[1.8, 2.3, -2.6]} />

      {/* shelves of folded tees on the back wall */}
      <Shelf position={[-3.2, 2.35, WALL_Z + 0.3]} colours={[["#EFE7D6", "#C9B48E", "#EFE7D6"], ["#1F2A44", "#15130F"], ["#5A1F2B", "#8C3B2A", "#5A1F2B"]]} />
      <Shelf position={[3.2, 2.35, WALL_Z + 0.3]} colours={[["#4A5A3A", "#EFE7D6"], ["#B9A8D6", "#EFE7D6", "#B9A8D6"], ["#15130F", "#1F2A44"]]} />

      {/* a round seat with a folded tee, and a tall mirror */}
      <group position={[-2.1, 0, 1.1]}>
        <mesh position-y={FLOOR_Y + 0.24} castShadow receiveShadow>
          <cylinderGeometry args={[0.42, 0.4, 0.48, 48]} />
          <meshStandardMaterial color="#7A5A40" roughness={0.9} />
        </mesh>
        <mesh position={[0.02, FLOOR_Y + 0.51, 0]} rotation-y={0.4}>
          <boxGeometry args={[0.42, 0.06, 0.3]} />
          <meshStandardMaterial color="#EFE7D6" roughness={1} />
        </mesh>
      </group>
      <group position={[4.3, 0, -3.4]} rotation-y={-0.75}>
        <mesh position-y={0.55}>
          <boxGeometry args={[0.92, 2.74, 0.05]} />
          <meshStandardMaterial {...BRASS} />
        </mesh>
        <mesh position={[0, 0.55, 0.03]}>
          <planeGeometry args={[0.8, 2.62]} />
          <meshStandardMaterial color="#DDE2E4" metalness={1} roughness={0.06} />
        </mesh>
      </group>

      {/* dust in the light */}
      <Sparkles count={36} scale={[3.2, 3, 2.4]} position={[0, 0.9, 0.2]} size={1.6} speed={0.25} opacity={0.35} color="#FFE7BE" />
    </group>
  );
}

/* ---------- the unfold ----------
   In the Review step the tee arrives folded like one from a shop shelf
   (both sides tucked behind, then folded in half), rises, opens in the air,
   and only then the customer's prints appear on it.

   The tee is a fixed shape, not cloth, so the folds are done while drawing:
   every point beyond a fold line is swung round that line. The same swing is
   applied to the tee, to its shadow and to every print, so they stay together. */
const FOLD = {
  left: { value: 0 }, // angle of each fold: 0 = open, PI = folded flat
  right: { value: 0 },
  bottom: { value: 0 },
  dims: { value: new THREE.Vector4(0.15, 0, 0.03, 0.12) }, // side fold line (x), bottom fold line (y), layer gap, how flat a folded tee is pressed
  printAt: 1e9, // seconds since the prints started to appear (huge = fully shown)
};
const FOLD_GLSL = /* glsl */ `
uniform float uFoldL;
uniform float uFoldR;
uniform float uFoldB;
uniform vec4 uFoldDims;
const float FOLD_SOFT = 0.05; // the crease is a short curve, not a hard edge
vec3 foldPos(vec3 p) {
  float k = max(max(uFoldL, uFoldR), uFoldB) / 3.14159;
  p.z *= mix(1.0, uFoldDims.w, smoothstep(0.0, 0.7, k));
  float xs = uFoldDims.x;
  if (p.x > xs) {
    float d = p.x - xs; float f = clamp(d / FOLD_SOFT, 0.0, 1.0); float a = uFoldL * f;
    float z = p.z;
    p.x = xs + d * cos(a) + z * sin(a);
    p.z = -d * sin(a) + z * cos(a) - uFoldDims.z * f * (1.0 - cos(uFoldL)) * 0.5;
  } else if (p.x < -xs) {
    float d = -xs - p.x; float f = clamp(d / FOLD_SOFT, 0.0, 1.0); float a = uFoldR * f;
    float z = p.z;
    p.x = -xs - (d * cos(a) + z * sin(a));
    p.z = -d * sin(a) + z * cos(a) - uFoldDims.z * f * (1.0 - cos(uFoldR));
  }
  if (p.y < uFoldDims.y) {
    float d = p.y - uFoldDims.y; float f = clamp(-d / FOLD_SOFT, 0.0, 1.0); float b = uFoldB * f;
    float z = p.z;
    p.y = uFoldDims.y + d * cos(b) - z * sin(b);
    p.z = d * sin(b) + z * cos(b) - uFoldDims.z * f * (1.0 - cos(uFoldB)) * 1.5;
  }
  return p;
}
vec3 foldDir(vec3 n, vec3 p) {
  float xs = uFoldDims.x;
  if (p.x > xs) { float a = uFoldL * clamp((p.x - xs) / FOLD_SOFT, 0.0, 1.0); n = vec3(n.x * cos(a) + n.z * sin(a), n.y, -n.x * sin(a) + n.z * cos(a)); }
  else if (p.x < -xs) { float a = uFoldR * clamp((-xs - p.x) / FOLD_SOFT, 0.0, 1.0); n = vec3(n.x * cos(a) - n.z * sin(a), n.y, n.x * sin(a) + n.z * cos(a)); }
  if (p.y < uFoldDims.y) { float b = uFoldB * clamp((uFoldDims.y - p.y) / FOLD_SOFT, 0.0, 1.0); n = vec3(n.x, n.y * cos(b) - n.z * sin(b), n.y * sin(b) + n.z * cos(b)); }
  return n;
}
`;
// Makes a material draw the fold (used on the tee, its shadow and the prints).
function foldable(shader) {
  shader.uniforms.uFoldL = FOLD.left;
  shader.uniforms.uFoldR = FOLD.right;
  shader.uniforms.uFoldB = FOLD.bottom;
  shader.uniforms.uFoldDims = FOLD.dims;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${FOLD_GLSL}`)
    .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nobjectNormal = foldDir(objectNormal, position);")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = foldPos(transformed);");
}
const foldKey = () => "identee-fold";
// the fold's values for a moment t (seconds) of the reveal
const ease = (x) => {
  const k = Math.min(1, Math.max(0, x));
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
};
const UNFOLD = { rise: 1.0, bottom: [0.9, 1.9], left: [1.7, 2.5], right: [1.9, 2.7], print: 2.75, end: 4.1 };
function setFold(t) {
  const part = ([a, b]) => Math.PI * (1 - ease((t - a) / (b - a)));
  FOLD.bottom.value = part(UNFOLD.bottom);
  FOLD.left.value = part(UNFOLD.left);
  FOLD.right.value = part(UNFOLD.right);
  FOLD.printAt = t - UNFOLD.print;
}
function openFold() {
  FOLD.left.value = 0;
  FOLD.right.value = 0;
  FOLD.bottom.value = 0;
  FOLD.printAt = 1e9;
}
// how visible a print is while they appear one after another
const printShown = (order) => Math.min(1, Math.max(0, (FOLD.printAt - order * 0.22) / 0.55));

/* ---------- the tee ---------- */
// Quantized glTF positions are small integers: copy to floats before moving them.
function floatGeometry(src) {
  const geo = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "tangent", "uv"]) {
    const at = src.getAttribute(name);
    if (!at) continue;
    const arr = new Float32Array(at.count * at.itemSize);
    const get = [at.getX, at.getY, at.getZ, at.getW];
    for (let i = 0; i < at.count; i++) for (let k = 0; k < at.itemSize; k++) arr[i * at.itemSize + k] = get[k].call(at, i);
    geo.setAttribute(name, new THREE.BufferAttribute(arr, at.itemSize));
  }
  if (src.index) geo.setIndex(Array.from(src.index.array));
  return geo;
}

function useTeeGeometry(url) {
  const gltf = useGLTF(url);
  return useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    let src = null;
    gltf.scene.traverse((o) => {
      if (o.isMesh && !src) src = o;
    });
    const geo = floatGeometry(src.geometry).applyMatrix4(src.matrixWorld);
    geo.computeBoundingBox();
    const c = new THREE.Vector3();
    geo.boundingBox.getCenter(c);
    const offset = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
    geo.applyMatrix4(offset);
    // measured points are raw z-up: (x, y, z) → (x, z, −y), then the same centring
    const toModel = offset.clone().multiply(
      new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)),
    );
    const probe = new THREE.Mesh(geo); // identity transform: raycasts in model space
    probe.userData.toModel = toModel;
    const map = src.material.map;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    return { geo, probe, map, normalMap: src.material.normalMap };
  }, [gltf]);
}

const SLEEVE_DEPTH = 0.09; // metres: enough for the sleeve's curve, not enough to reach the body behind it

// The sleeve's general direction over the whole print area. (One triangle's
// own direction can sit on a fold and tilt the whole print.)
function sleeveNormal(probe, r, p, geometry, firstHit) {
  const sum = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const q = new THREE.Vector3(p.x, p.y + (j / 2) * geometry.h * 0.35, p.z + (i / 2) * geometry.w * 0.35);
      ray.set(r.origin(q), r.dir);
      const hit = ray.intersectObject(probe, false)[0];
      // only the sleeve's outer face (a ray past the sleeve's edge would hit the body)
      if (hit && Math.abs(hit.distance - firstHit.distance) < 0.06) sum.add(hit.face.normal);
    }
  }
  return sum.lengthSq() > 0 ? sum.normalize() : firstHit.face.normal.clone().normalize();
}

// Keep only the decal's triangles that face the way the print is pressed on.
function keepFacing(geo, n, min) {
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const uv = geo.getAttribute("uv");
  const P = [];
  const N = [];
  const U = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    let facing = 0;
    for (let k = 0; k < 3; k++) facing += v.fromBufferAttribute(nor, i + k).dot(n);
    if (facing / 3 < min) continue;
    for (let k = 0; k < 3; k++) {
      P.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      N.push(nor.getX(i + k), nor.getY(i + k), nor.getZ(i + k));
      U.push(uv.getX(i + k), uv.getY(i + k));
    }
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
}

function Decal({ probe, spot, canvas, version, areaKey, onPick, interactive, order }) {
  const texRef = useRef(null);
  const matRef = useRef(null);
  useFrame(() => {
    if (matRef.current) matRef.current.opacity = printShown(order);
  });
  const geometry = useMemo(() => {
    if (!spot) return null;
    const raw = new THREE.Vector3(...areaCentreRaw(spot));
    return { raw, side: spot.side, w: spot.w, h: spot.h };
  }, [spot]);
  const built = useMemo(() => {
    if (!geometry) return null;
    const p = geometry.raw.clone().applyMatrix4(probe.userData.toModel);
    const r = RAY[geometry.side];
    const ray = new THREE.Raycaster(r.origin(p), r.dir);
    const hit = ray.intersectObject(probe, false)[0];
    if (!hit) return null;
    // Front and back prints are pressed on flat, so project them straight
    // on. (The fabric's own direction at the area's middle can face sideways
    // on a fold, which twisted tall or off-centre areas.) Sleeves slope, so
    // they keep the fabric's direction.
    const flat = geometry.side === "front" || geometry.side === "back";
    const n = flat ? r.dir.clone().negate() : sleeveNormal(probe, r, p, geometry, hit);
    const up = new THREE.Vector3(0, 1, 0);
    const xAxis = up.clone().cross(n).normalize();
    const yAxis = n.clone().cross(xAxis);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, n));
    const geo = new DecalGeometry(probe, hit.point.clone(), new THREE.Euler().setFromQuaternion(q), new THREE.Vector3(geometry.w, geometry.h, flat ? 0.18 : SLEEVE_DEPTH));
    // a sleeve print must stay on the sleeve's outer face: drop the bits that
    // landed on folds turned away from it, the hem's inside or the body behind
    if (!flat) keepFacing(geo, n, 0.3);
    return { geo, point: hit.point.clone(), normal: n };
  }, [geometry, probe]);

  useEffect(() => () => built?.geo.dispose(), [built]);
  useEffect(() => {
    if (texRef.current && canvas) {
      texRef.current.image = canvas;
      texRef.current.needsUpdate = true;
    }
  }, [canvas, version]);

  if (!built || !canvas) return null;
  return (
    <mesh
      geometry={built.geo}
      renderOrder={2}
      userData={{ areaKey, point: built.point, normal: built.normal, w: geometry.w, h: geometry.h }}
      onClick={(e) => {
        if (!interactive || e.delta > 6) return;
        e.stopPropagation();
        onPick?.(areaKey);
      }}
    >
      <meshStandardMaterial ref={matRef} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-4} roughness={0.8} onBeforeCompile={foldable} customProgramCacheKey={foldKey}>
        <canvasTexture ref={texRef} attach="map" args={[canvas]} colorSpace={THREE.SRGBColorSpace} anisotropy={8} />
      </meshStandardMaterial>
    </mesh>
  );
}

function Tee({ model, colour, areas, onPickArea, interactive, still, spotsRef, turntable, spin, face, spinSpeed, unfoldKey }) {
  const { geo, probe, map, normalMap } = useTeeGeometry(model.url);
  const group = useRef();
  const mesh = useRef();
  const mat = useRef();
  const target = useMemo(() => new THREE.Color(colour), [colour]);
  const speed = useRef(0); // turntable speed, eased
  // the reveal: starts when unfoldKey changes (0 = no reveal); a tap on the tee skips it
  const unfold = useRef({ key: 0, t0: 0, on: false });
  const shadow = useMemo(() => {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.onBeforeCompile = foldable;
    m.customProgramCacheKey = foldKey;
    return m;
  }, []);
  useLayoutEffect(() => {
    // fold lines from the tee's own size: sides at 30% of the half width, bottom at half the height
    const b = geo.boundingBox;
    if (b) FOLD.dims.value.set(Math.max(Math.abs(b.min.x), Math.abs(b.max.x)) * 0.3, (b.min.y + b.max.y) / 2, 0.03, 0.12);
  }, [geo]);
  useEffect(() => openFold, []);

  useFrame((state, dt) => {
    if (mat.current) mat.current.color.lerp(target, Math.min(1, dt * 6));
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const k = still ? 0 : 1;
    const u = unfold.current;
    if (u.key !== unfoldKey) {
      u.key = unfoldKey;
      u.on = !!unfoldKey && turntable;
      u.t0 = t;
    }
    if (u.on && (!turntable || t - u.t0 > UNFOLD.end)) u.on = false;
    if (u.on) {
      // folded: lying tilted back low over the plinth; it rises and stands up, then opens
      const s = t - u.t0;
      const up = ease(s / UNFOLD.rise);
      setFold(s);
      g.position.y = THREE.MathUtils.lerp(TEE_Y - 0.5, TEE_Y + 0.22, up);
      g.rotation.x = THREE.MathUtils.lerp(-1.15, 0, ease((s - 0.2) / 1.2));
      g.rotation.y = THREE.MathUtils.lerp(0.9, 0, ease(s / 1.6));
      speed.current = 0;
      return;
    }
    openFold();
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, 0, 0.15);
    g.position.y = THREE.MathUtils.lerp(g.position.y, TEE_Y + (turntable ? 0.22 : 0) + Math.sin(t / 1.4) * 0.025 * k, 0.08);
    // the shortest way round to an angle
    const towards = (to, f) => {
      const d = Math.atan2(Math.sin(to - g.rotation.y), Math.cos(to - g.rotation.y));
      g.rotation.y += d * f;
    };
    if (turntable && spin && face == null) {
      // Review: the tee itself turns (the room stays still); spinSpeed 2 = one turn in 30 s
      speed.current += ((spinSpeed * Math.PI) / 30 - speed.current) * 0.05;
      g.rotation.y += speed.current * Math.min(dt, 0.05);
    } else {
      speed.current = 0;
      towards(turntable ? FACE[face] ?? 0 : Math.sin(t / 3.2) * 0.06 * k, turntable ? 0.07 : 0.1);
    }
  });

  // expose each area's surface point (world) for the camera
  useLayoutEffect(() => {
    spotsRef.current = (key) => {
      const m = mesh.current?.children.find((c) => c.userData.areaKey === key);
      if (!m || !mesh.current) return null;
      mesh.current.updateMatrixWorld(true);
      const point = m.userData.point.clone().applyMatrix4(mesh.current.matrixWorld);
      const normal = m.userData.normal.clone().transformDirection(mesh.current.matrixWorld);
      const scale = mesh.current.getWorldScale(new THREE.Vector3()).x;
      return { point, normal, w: m.userData.w * scale, h: m.userData.h * scale }; // size on screen units
    };
  });

  return (
    <group ref={group} name="tee" scale={TEE_SCALE} position-y={TEE_Y}>
      <mesh
        ref={mesh}
        geometry={geo}
        castShadow
        customDepthMaterial={shadow}
        onPointerDown={() => {
          unfold.current.on = false; // a tap skips the reveal
        }}
      >
        <meshStandardMaterial ref={mat} color={colour} map={map} normalMap={normalMap} normalScale={[0.8, 0.8]} roughness={0.92} metalness={0} side={THREE.DoubleSide} onBeforeCompile={foldable} customProgramCacheKey={foldKey} />
        {areas.map((a, i) => (
          <Decal key={`${a.key}-${a.spotKey}`} order={i} areaKey={a.key} probe={probe} spot={a.spot} canvas={a.canvas} version={a.version} onPick={onPickArea} interactive={interactive} />
        ))}
      </mesh>
    </group>
  );
}

/* ---------- camera ---------- */
function CameraRig({ request, getSpot, apiRef, wakeKey, room }) {
  const { camera, controls, gl, scene, size, invalidate } = useThree();
  const anim = useRef(null);

  const pending = useRef(null); // area request waiting for its decal to exist
  const start = (request) => {
    let to;
    let look = new THREE.Vector3(0, 0.1, 0);
    if (request.view) {
      to = new THREE.Vector3(...VIEWS[request.view]);
    } else if (request.area) {
      const s = getSpot(request.area);
      if (!s) {
        // the area's outline decal appears a moment later — try again then
        if (!pending.current || pending.current.request !== request) pending.current = { request, frames: 90 };
        return;
      }
      pending.current = null;
      // Frame the area by its real size: as close as possible while the whole
      // area stays inside the free part of the screen (the editor covers the
      // right ~420 px on a computer, the lower part on a phone). Small areas
      // (chest, sleeves) get a close-up; tall ones (Full Front) show whole.
      const narrow = request.narrow;
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const aspect = size.width / Math.max(1, size.height);
      // overlayPx: how much of the view's right side a floating panel covers (0 = panels sit beside the view)
      const freeW = narrow ? 1 : Math.max(0.35, 1 - (request.overlayPx ?? 424) / Math.max(1, size.width));
      const freeH = narrow ? 0.28 : 1; // phone: the strip between the top bars and the editor sheet
      const fitH = s.h / (2 * tan * freeH * (narrow ? 0.92 : (request.fill ?? 0.52))); // fill: how much of the view's height the area may take
      const fitW = s.w / (2 * tan * aspect * freeW * 0.74);
      // not closer than 1.45: a small area (sleeve, chest) keeps some tee around it for context
      const dist = THREE.MathUtils.clamp(Math.max(fitH, fitW), 1.45, 9);
      const viewH = 2 * dist * tan;
      // slide the view so the area sits in the middle of the free space
      // view direction: straight on for front/back; for sleeves the fabric's
      // direction, kept level (the surface can tilt on a fold)
      const facing =
        request.side === "front"
          ? new THREE.Vector3(0, 0, 1)
          : request.side === "back"
            ? new THREE.Vector3(0, 0, -1)
            : new THREE.Vector3(s.normal.x, 0, s.normal.z).normalize();
      const right = new THREE.Vector3().crossVectors(facing.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
      const pan = narrow ? 0 : ((1 - freeW) / 2) * viewH * aspect;
      const drop = narrow ? viewH * 0.225 : viewH * (request.lift ?? 0.025); // phone: the strip's middle is ~27% from the top
      look = s.point.clone().add(right.multiplyScalar(pan));
      look.y -= drop;
      to = look.clone().add(facing.multiplyScalar(dist));
    } else if (request.position) {
      to = new THREE.Vector3(...request.position);
      if (request.look) look = new THREE.Vector3(...request.look);
    }
    if (request.from) camera.position.set(...request.from);
    anim.current = { from: camera.position.clone(), to, tf: controls.target.clone(), tt: look, t0: performance.now(), ms: request.ms || 900 };
  };
  useEffect(() => {
    if (request && controls) start(request);
  }, [request, controls]); // eslint-disable-line react-hooks/exhaustive-deps
  // the view changed size (a side panel opened or closed): frame the same area again
  useEffect(() => {
    if (request?.area && request.keep && controls) start({ ...request, ms: 350 });
  }, [size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps

  // While an area is being edited the room is only drawn when something
  // changes (frameloop "demand"), so the computer is free for the dragging.
  // Any change keeps it drawing for a moment so moves and fades can finish.
  const awake = useRef(0);
  useEffect(() => {
    awake.current = 110; // frames (about 2 s) — counted in frames so a hidden tab doesn't use them up
    invalidate();
  }, [wakeKey, request, size.width, size.height, invalidate]);

  // while the customer is turning the view themselves, the pointer lean waits
  const dragging = useRef(false);
  useEffect(() => {
    if (!controls) return undefined;
    const on = () => (dragging.current = true);
    const off = () => (dragging.current = false);
    controls.addEventListener("start", on);
    controls.addEventListener("end", off);
    return () => {
      controls.removeEventListener("start", on);
      controls.removeEventListener("end", off);
    };
  }, [controls]);

  useFrame((frame) => {
    if (awake.current > 0) awake.current -= 1;
    if (awake.current > 0 || anim.current || pending.current) invalidate();
    const p = pending.current;
    if (p) {
      if ((p.frames -= 1) <= 0) pending.current = null;
      else start(p.request);
    }
    const a = anim.current;
    // dressing room: the view leans slightly towards the pointer, which gives the room depth
    if (!a && controls && room === "boutique" && !dragging.current) {
      controls.setAzimuthalAngle(THREE.MathUtils.lerp(controls.getAzimuthalAngle(), -frame.pointer.x * 0.2, 0.03));
      controls.setPolarAngle(THREE.MathUtils.lerp(controls.getPolarAngle(), Math.PI * 0.48 - frame.pointer.y * 0.05, 0.03));
    }
    if (!a || !controls) return;
    const t = Math.min(1, (performance.now() - a.t0) / a.ms);
    const k = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(a.from, a.to, k);
    controls.target.lerpVectors(a.tf, a.tt, k);
    if (t >= 1) anim.current = null;
  });

  // Review mockups: render each side from a fixed camera into a JPEG.
  // Handed to the page at commit time, with no clean-up, so it is there as
  // soon as the 3D view exists (the Review pictures need it straight away).
  const api = {
    // an area's picture was repainted in place (dragging): show it again
    touch(areaKey) {
      scene.traverse((o) => {
        if (o.userData?.areaKey === areaKey && o.material?.map) o.material.map.needsUpdate = true;
      });
      awake.current = Math.max(awake.current, 4); // a few frames, so no step of the drag is missed
      invalidate();
    },
    snapshot(view) {
      const keepP = camera.position.clone();
      const keepT = controls ? controls.target.clone() : new THREE.Vector3();
      // mockup pictures are always taken in the bright studio with the tee
      // facing forward, whatever the room and turntable are doing right now
      const studio = scene.getObjectByName("set-studio");
      const boutique = scene.getObjectByName("set-boutique");
      const tee = scene.getObjectByName("tee");
      const was = { studio: studio?.visible, boutique: boutique?.visible, turn: tee?.rotation.y, tilt: tee?.rotation.x, y: tee?.position.y, fold: [FOLD.left.value, FOLD.right.value, FOLD.bottom.value] };
      const prints = [];
      scene.traverse((o) => {
        if (o.userData?.areaKey && o.material) prints.push([o.material, o.material.opacity]);
      });
      prints.forEach(([m]) => (m.opacity = 1));
      FOLD.left.value = 0;
      FOLD.right.value = 0;
      FOLD.bottom.value = 0;
      if (studio) studio.visible = true;
      if (boutique) boutique.visible = false;
      if (tee) {
        tee.rotation.y = 0;
        tee.rotation.x = 0;
        tee.position.y = TEE_Y;
      }
      paintBackdrop(scene, "studio");
      const env = swapEnvironment(scene, null);
      camera.position.set(...VIEWS[view]);
      camera.lookAt(0, 0.1, 0);
      gl.render(scene, camera);
      const url = gl.domElement.toDataURL("image/jpeg", 0.85);
      if (studio) studio.visible = was.studio;
      if (boutique) boutique.visible = was.boutique;
      if (tee) {
        tee.rotation.y = was.turn;
        tee.rotation.x = was.tilt;
        tee.position.y = was.y;
      }
      prints.forEach(([m, o]) => (m.opacity = o));
      [FOLD.left.value, FOLD.right.value, FOLD.bottom.value] = was.fold;
      paintBackdrop(scene, room);
      swapEnvironment(scene, env);
      camera.position.copy(keepP);
      if (controls) {
        controls.target.copy(keepT);
        camera.lookAt(keepT);
      }
      return url;
    },
  };
  useLayoutEffect(() => {
    if (apiRef) apiRef.current = api;
  });
  return null;
}

const Room3D = forwardRef(function Room3D({ model, colour, areas, onPickArea, camRequest, interactive = true, still = false, room = "studio", spin = false, face = null, spinSpeed = 1.6, unfoldKey = 0 }, ref) {
  const boutique = room === "boutique";
  const spotsRef = useRef(() => null);
  return (
    <Canvas
      shadows
      frameloop={still ? "demand" : "always"}
      dpr={[1, 2]}
      camera={{ fov: 32, position: [0, 1.5, 8], near: 0.05, far: 50 }}
      gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      style={{ position: "absolute", inset: 0, touchAction: "none" }}
    >
      <Backdrop room={room} />
      <Studio visible={!boutique} />
      <Suspense fallback={null}>
        <Boutique visible={boutique} model={model} />
        <Tee model={model} colour={colour} areas={areas} onPickArea={onPickArea} interactive={interactive} still={still} spotsRef={spotsRef} turntable={boutique} spin={spin} face={face} spinSpeed={spinSpeed} unfoldKey={unfoldKey} />
      </Suspense>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        minDistance={1}
        maxDistance={9}
        minPolarAngle={Math.PI * 0.28}
        maxPolarAngle={Math.PI * 0.62}
        target={ORBIT_TARGET}
        // in the dressing room the camera stays in front (the racks are at the sides); the tee turns instead
        minAzimuthAngle={boutique ? -0.5 : -Infinity}
        maxAzimuthAngle={boutique ? 0.5 : Infinity}
      />
      <CameraRig request={camRequest} getSpot={(k) => spotsRef.current(k)} apiRef={ref} room={room} wakeKey={`${colour}|${still}|${interactive}|${areas.map((a) => `${a.key}:${a.version}`).join(",")}`} />
    </Canvas>
  );
});

export default Room3D;

useGLTF.preload("/models/oversized-tee.glb");

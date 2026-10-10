// studio/Room3D.jsx
//
// The 3D "Design Room": a warm studio with the chosen tee floating in the
// centre. Each print area is a decal (DecalGeometry) pressed onto the tee at
// its true physical size; its picture comes from the area's Konva render.
import { Suspense, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, forwardRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
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

/* ---------- studio set ---------- */
function Studio() {
  return (
    <>
      <color attach="background" args={["#EDE3D0"]} />
      <fog attach="fog" args={["#EDE3D0", 6, 12]} />
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
    </>
  );
}

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

function Decal({ probe, spot, canvas, version, areaKey, onPick, interactive }) {
  const texRef = useRef(null);
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
    const n = hit.face.normal.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const xAxis = up.clone().cross(n).normalize();
    const yAxis = n.clone().cross(xAxis);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, n));
    const geo = new DecalGeometry(probe, hit.point.clone(), new THREE.Euler().setFromQuaternion(q), new THREE.Vector3(geometry.w, geometry.h, 0.18));
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
      <meshStandardMaterial transparent depthWrite={false} polygonOffset polygonOffsetFactor={-4} roughness={0.8}>
        <canvasTexture ref={texRef} attach="map" args={[canvas]} colorSpace={THREE.SRGBColorSpace} anisotropy={8} />
      </meshStandardMaterial>
    </mesh>
  );
}

function Tee({ model, colour, areas, onPickArea, interactive, still, spotsRef }) {
  const { geo, probe, map, normalMap } = useTeeGeometry(model.url);
  const group = useRef();
  const mesh = useRef();
  const mat = useRef();
  const target = useMemo(() => new THREE.Color(colour), [colour]);

  useFrame((state, dt) => {
    if (mat.current) mat.current.color.lerp(target, Math.min(1, dt * 6));
    if (group.current) {
      const t = state.clock.elapsedTime;
      const k = still ? 0 : 1;
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, TEE_Y + Math.sin(t / 1.4) * 0.025 * k, 0.1);
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, Math.sin(t / 3.2) * 0.06 * k, 0.1);
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
    <group ref={group} scale={TEE_SCALE} position-y={TEE_Y}>
      <mesh ref={mesh} geometry={geo} castShadow>
        <meshStandardMaterial ref={mat} color={colour} map={map} normalMap={normalMap} normalScale={[0.8, 0.8]} roughness={0.92} metalness={0} side={THREE.DoubleSide} />
        {areas.map((a) => (
          <Decal key={`${a.key}-${a.spotKey}`} areaKey={a.key} probe={probe} spot={a.spot} canvas={a.canvas} version={a.version} onPick={onPickArea} interactive={interactive} />
        ))}
      </mesh>
    </group>
  );
}

/* ---------- camera ---------- */
function CameraRig({ request, getSpot, apiRef }) {
  const { camera, controls, gl, scene, size } = useThree();
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
        if (!pending.current || pending.current.request !== request) pending.current = { request, until: performance.now() + 1500 };
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
      const freeW = narrow ? 1 : Math.max(0.35, 1 - 424 / Math.max(1, size.width));
      const freeH = narrow ? 0.28 : 1; // phone: the strip between the top bars and the editor sheet
      const fitH = s.h / (2 * tan * freeH * (narrow ? 0.92 : 0.52)); // computer: clear of the size bar and the area cards
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
      const drop = narrow ? viewH * 0.225 : viewH * 0.025; // phone: the strip's middle is ~27% from the top
      look = s.point.clone().add(right.multiplyScalar(pan));
      look.y -= drop;
      to = look.clone().add(facing.multiplyScalar(dist));
    } else if (request.position) {
      to = new THREE.Vector3(...request.position);
    }
    anim.current = { from: camera.position.clone(), to, tf: controls.target.clone(), tt: look, t0: performance.now(), ms: request.ms || 900 };
  };
  useEffect(() => {
    if (request && controls) start(request);
  }, [request, controls]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(() => {
    const p = pending.current;
    if (p) {
      if (performance.now() > p.until) pending.current = null;
      else start(p.request);
    }
    const a = anim.current;
    if (!a || !controls) return;
    const t = Math.min(1, (performance.now() - a.t0) / a.ms);
    const k = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(a.from, a.to, k);
    controls.target.lerpVectors(a.tf, a.tt, k);
    if (t >= 1) anim.current = null;
  });

  // Review mockups: render each side from a fixed camera into a JPEG.
  useImperativeHandle(apiRef, () => ({
    snapshot(view) {
      const keepP = camera.position.clone();
      const keepT = controls ? controls.target.clone() : new THREE.Vector3();
      camera.position.set(...VIEWS[view]);
      camera.lookAt(0, 0.1, 0);
      gl.render(scene, camera);
      const url = gl.domElement.toDataURL("image/jpeg", 0.85);
      camera.position.copy(keepP);
      if (controls) {
        controls.target.copy(keepT);
        camera.lookAt(keepT);
      }
      return url;
    },
  }));
  return null;
}

const Room3D = forwardRef(function Room3D({ model, colour, areas, onPickArea, camRequest, interactive = true, still = false, autoRotate = false }, ref) {
  const spotsRef = useRef(() => null);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 32, position: [0, 1.5, 8], near: 0.05, far: 50 }}
      gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      style={{ position: "absolute", inset: 0, touchAction: "none" }}
    >
      <Studio />
      <Suspense fallback={null}>
        <Tee model={model} colour={colour} areas={areas} onPickArea={onPickArea} interactive={interactive} still={still} spotsRef={spotsRef} />
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
        autoRotate={autoRotate}
        autoRotateSpeed={1.6}
      />
      <CameraRig request={camRequest} getSpot={(k) => spotsRef.current(k)} apiRef={ref} />
    </Canvas>
  );
});

export default Room3D;

useGLTF.preload("/models/oversized-tee.glb");

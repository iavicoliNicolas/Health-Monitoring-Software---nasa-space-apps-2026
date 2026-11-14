import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createWatchPainter, gaugeRotationY, logT, paintStaticDial, unitT } from "./dials.js";
import { SCENARIOS } from "./content.js";

const POSE = {
  diario: { pos: [0.0, 0.46, 0.92], target: [0.0, 0.2, 0.0], fov: 36 },
  capitulo: { pos: [0.1, 0.36, 0.62], target: [0.08, 0.2, 0.0], fov: 32 },
  reloj: { pos: [0.46, 0.22, 0.34], target: [0.5, 0.06, 0.12], fov: 28 },
  casco: { pos: [0.22, 0.52, -0.18], target: [0.22, 0.52, -0.95], fov: 40 },
};

const EARTH_VERT = `
  varying vec3 vPos;
  varying vec3 vN;
  void main() {
    vPos = position;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EARTH_FRAG = `
  varying vec3 vPos;
  varying vec3 vN;
  uniform float uTime;
  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i);
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z
    );
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec3(1.7, 9.2, 2.4);
      a *= 0.5;
    }
    return v;
  }
  void main() {
    vec3 sp = normalize(vPos);
    float rot = uTime * 0.045;
    float c = cos(rot);
    float s = sin(rot);
    sp = vec3(c * sp.x + s * sp.z, sp.y, -s * sp.x + c * sp.z);
    float land = smoothstep(0.46, 0.6, fbm(sp * 2.3));
    float detail = smoothstep(0.5, 0.72, fbm(sp * 5.1 + 3.0));
    vec3 ocean = vec3(0.015, 0.09, 0.26);
    vec3 shore = vec3(0.05, 0.16, 0.14);
    vec3 green = vec3(0.08, 0.2, 0.1);
    vec3 col = mix(ocean, shore, land);
    col = mix(col, green, land * detail);
    float cloud = smoothstep(0.55, 0.78, fbm(sp * 3.4 + vec3(uTime * 0.008, 1.2, 0.0)));
    col = mix(col, vec3(0.82, 0.88, 0.92), cloud * 0.75);
    vec3 L = normalize(vec3(-0.75, 0.42, 0.4));
    float ndl = dot(normalize(vN), L);
    float day = clamp(ndl * 0.55 + 0.45, 0.0, 1.0);
    float cities = smoothstep(0.78, 0.92, noise(sp * 26.0)) * land * (1.0 - clamp(ndl, 0.0, 1.0));
    col = col * day + vec3(1.0, 0.78, 0.45) * cities * 0.25;
    float fres = pow(1.0 - max(dot(normalize(vN), vec3(0.0, 0.0, 1.0)), 0.0), 2.0);
    col += vec3(0.25, 0.48, 0.75) * fres * 0.35;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function canvasTexture(canvas, anisotropy) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

function makeNeedle(length) {
  const cone = new THREE.ConeGeometry(0.0042, length, 6);
  cone.rotateX(-Math.PI / 2);
  cone.translate(0, 0, -length / 2);
  return cone;
}

function tableTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#241f1b";
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 80; i += 1) {
    ctx.strokeStyle = `rgba(20, 16, 12, ${0.15 + Math.random() * 0.35})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const y = Math.random() * 1024;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(300, y + 20, 700, y - 30, 1024, y + 8);
    ctx.stroke();
  }
  const worn = ctx.createRadialGradient(520, 540, 40, 520, 540, 420);
  worn.addColorStop(0, "rgba(90, 78, 64, 0.45)");
  worn.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = worn;
  ctx.fillRect(0, 0, 1024, 1024);
  const oil = ctx.createRadialGradient(700, 300, 10, 700, 300, 90);
  oil.addColorStop(0, "rgba(0,0,0,0.35)");
  oil.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = oil;
  ctx.fillRect(0, 0, 1024, 1024);
  return canvas;
}

function starTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
    const s = Math.random() < 0.08 ? 2 : 1;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
  }
  return canvas;
}

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,220,170,0.7)");
  g.addColorStop(1, "rgba(255,180,80,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvas;
}

function paintPlate(ctx, activeId) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#6d655c";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i += 1) {
    ctx.strokeStyle = "rgba(30,24,18,0.25)";
    ctx.beginPath();
    ctx.moveTo(0, Math.random() * h);
    ctx.lineTo(w, Math.random() * h);
    ctx.stroke();
  }
  const n = SCENARIOS.length;
  const slot = w / n;
  let size = 22;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (; size > 12; size -= 1) {
    ctx.font = `${size}px 'Russo One', sans-serif`;
    const widest = Math.max(...SCENARIOS.map((scenario) => ctx.measureText(scenario.ru).width));
    if (widest <= slot - 12) break;
  }
  SCENARIOS.forEach((scenario, i) => {
    const x = slot * (i + 0.5);
    const on = scenario.id === activeId;
    ctx.fillStyle = on ? "#ffb15a" : "#1c1814";
    ctx.fillText(scenario.ru, x, h / 2);
  });
}

export function createWorld(canvas, sheets) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x070605, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.86;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const gl = renderer.getContext();
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const gpuName = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const software = /swiftshader|llvmpipe|softpipe|software/i.test(gpuName);
  const params = new URLSearchParams(location.search);
  const wantPost = params.get("post");
  const usePost = wantPost === "1" ? true : wantPost === "0" ? false : !software;
  const pixelCap = software ? 1 : Math.min(window.devicePixelRatio || 1, 1.6);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070605);
  scene.fog = new THREE.FogExp2(0x070605, 0.16);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
  scene.environmentIntensity = 0.28;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const leftTex = canvasTexture(sheets.left, anisotropy);
  const rightTex = canvasTexture(sheets.right, anisotropy);

  const steel = new THREE.MeshStandardMaterial({ color: 0x8d8880, metalness: 0.86, roughness: 0.38 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x3a3834, metalness: 0.7, roughness: 0.46 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x4a3024, roughness: 0.78, metalness: 0.04 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1917, roughness: 0.9 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a3e, metalness: 0.75, roughness: 0.34 });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xc4964a,
    metalness: 1,
    roughness: 0.18,
    envMapIntensity: 1.1,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xe7eef2,
    transparent: true,
    opacity: 0.2,
    roughness: 0.04,
    metalness: 0,
    depthWrite: false,
  });

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.07, 1.35),
    new THREE.MeshStandardMaterial({
      map: canvasTexture(tableTexture(), anisotropy),
      color: 0x3e3832,
      roughness: 0.86,
      metalness: 0.42,
    }),
  );
  table.position.set(0, -0.035, 0.04);
  table.receiveShadow = true;
  scene.add(table);

  const book = new THREE.Group();
  book.position.set(-0.015, 0, -0.03);
  book.rotation.y = -0.05;
  scene.add(book);

  const blotter = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.012, 0.58), leather);
  blotter.position.set(0, 0.004, 0);
  blotter.receiveShadow = true;
  book.add(blotter);

  function makePage(side, texture) {
    const w = 0.34;
    const h = 0.467;
    const geo = new THREE.PlaneGeometry(w, h, 14, 8);
    geo.translate(side === "right" ? w / 2 : -w / 2, 0, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const edge = side === "right" ? x / w : -x / w;
      pos.setZ(i, Math.max(0, edge) ** 2 * 0.014);
    }
    geo.computeVertexNormals();
    const front = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.94,
        metalness: 0,
        alphaTest: 0.3,
      }),
    );
    front.castShadow = true;
    front.receiveShadow = true;
    front.userData.pick = side === "right" ? "page" : "diario";
    const back = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0xd9c7a6, roughness: 0.96, side: THREE.BackSide }),
    );
    const pivot = new THREE.Group();
    pivot.add(front, back);
    const hinge = new THREE.Group();
    hinge.rotation.x = -0.7;
    hinge.position.set(side === "right" ? 0.004 : -0.004, 0.2, 0);
    hinge.add(pivot);
    book.add(hinge);
    return { pivot, front };
  }

  const leftPage = makePage("left", leftTex);
  const rightPage = makePage("right", rightTex);

  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.47, 0.028), leather);
  spine.rotation.x = -0.7;
  spine.position.set(0, 0.2, 0);
  book.add(spine);

  const ribbon = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.22, 0.002),
    new THREE.MeshStandardMaterial({ color: 0x7a2420, roughness: 0.6 }),
  );
  ribbon.rotation.x = -Math.PI / 2;
  ribbon.position.set(0.04, 0.012, 0.3);
  book.add(ribbon);

  function makeGauge(radius, texture, needleColor) {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.05, 0.02, 36), steel);
    body.castShadow = true;
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.9, 40),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.62, metalness: 0.05 }),
    );
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.011;
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.92, radius * 0.075, 8, 32), steel);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.y = 0.012;
    const pivot = new THREE.Group();
    pivot.position.y = 0.016;
    const needle = new THREE.Mesh(
      makeNeedle(radius * 0.72),
      new THREE.MeshStandardMaterial({
        color: needleColor,
        emissive: needleColor,
        emissiveIntensity: 0.25,
        roughness: 0.35,
      }),
    );
    pivot.add(needle);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.07, radius * 0.07, 0.008, 14), darkSteel);
    cap.position.y = 0.02;
    const glass = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.88, 32), glassMat);
    glass.rotation.x = -Math.PI / 2;
    glass.position.y = 0.024;
    root.add(body, face, bezel, pivot, cap, glass);
    root.userData.pivot = pivot;
    return root;
  }

  const heart = makeGauge(0.062, canvasTexture(paintStaticDial("heart"), anisotropy), 0x8d1d16);
  heart.position.set(-0.28, 0.04, 0.28);
  heart.rotation.x = 0.72;
  heart.rotation.y = 0.25;
  scene.add(heart);

  const o2 = makeGauge(0.048, canvasTexture(paintStaticDial("o2"), anisotropy), 0x16382e);
  o2.position.set(0.46, 0.04, -0.22);
  o2.rotation.x = 0.7;
  o2.rotation.y = -0.4;
  scene.add(o2);

  const co2 = makeGauge(0.04, canvasTexture(paintStaticDial("co2"), anisotropy), 0x6a3e16);
  co2.position.set(0.6, 0.04, -0.08);
  co2.rotation.x = 0.66;
  co2.rotation.y = -0.55;
  scene.add(co2);

  const watchPainter = createWatchPainter();
  const watchTex = canvasTexture(watchPainter.canvas, anisotropy);
  const watch = new THREE.Group();
  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.01, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x4a3424, roughness: 0.88 }),
  );
  strap.position.y = -0.006;
  const watchBody = makeGauge(0.086, watchTex, 0xd7e68a);
  watch.add(strap, watchBody);
  watch.position.set(0.5, 0.05, 0.16);
  watch.rotation.x = 0.58;
  watch.rotation.y = -0.35;
  watch.rotation.z = 0.12;
  watch.userData.pick = "reloj";
  scene.add(watch);

  const tubeH = 0.17;
  const column = new THREE.Group();
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, tubeH, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xd5e4ea,
      transparent: true,
      opacity: 0.28,
      roughness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const liquidMat = new THREE.MeshStandardMaterial({
    color: 0x1f8f5a,
    emissive: 0x0d5a32,
    emissiveIntensity: 0.45,
    roughness: 0.35,
  });
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 1, 12), liquidMat);
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 12), brass);
  capTop.position.y = tubeH / 2;
  const capBot = capTop.clone();
  capBot.position.y = -tubeH / 2;
  column.add(tube, liquid, capTop, capBot);
  column.position.set(-0.34, 0.1, 0.22);
  column.rotation.z = 0.08;
  scene.add(column);

  const helmet = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.155, 28, 20), steel);
  shell.scale.set(1.02, 1.12, 1.06);
  shell.castShadow = true;
  const neck = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.015, 8, 18), darkSteel);
  neck.rotation.x = Math.PI / 2;
  neck.position.y = -0.115;
  const visor = new THREE.Mesh(new THREE.CircleGeometry(0.085, 28), gold);
  visor.position.set(0, 0.02, 0.14);
  const visorRim = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.008, 8, 24), darkSteel);
  visorRim.position.copy(visor.position);
  const tapeMat = new THREE.MeshStandardMaterial({ color: 0xc2b48a, roughness: 0.8 });
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 0.006), tapeMat);
  tape.position.set(-0.01, 0.07, 0.145);
  tape.rotation.z = 0.35;
  const hose = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.1, -0.04, 0.05),
        new THREE.Vector3(0.2, -0.1, 0.02),
        new THREE.Vector3(0.16, -0.2, -0.02),
      ]),
      14,
      0.008,
      6,
      false,
    ),
    rubber,
  );
  const sideLampMat = new THREE.MeshStandardMaterial({
    color: 0xff4422,
    emissive: 0xff2208,
    emissiveIntensity: 0.35,
  });
  const sideLamp = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 12), sideLampMat);
  sideLamp.position.set(0.11, 0.0, 0.1);
  helmet.add(shell, neck, visor, visorRim, tape, hose, sideLamp);
  helmet.position.set(-0.55, 0.16, 0.02);
  helmet.rotation.y = 0.55;
  helmet.userData.pick = "casco";
  scene.add(helmet);

  const lamp = new THREE.Group();
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.015, 20), brass);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.22, 0.015), darkSteel);
  arm.position.y = 0.12;
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.045, 0.07, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2c261e, roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide }),
  );
  shade.position.set(0.08, 0.25, 0);
  shade.rotation.z = -0.5;
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffd2a8,
    emissive: 0xffb066,
    emissiveIntensity: 2.2,
  });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 12), bulbMat);
  bulb.position.copy(shade.position);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: canvasTexture(glowTexture(), 1),
      color: 0xffb066,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.position.copy(shade.position);
  glow.scale.set(0.42, 0.42, 1);
  lamp.add(lampBase, arm, shade, bulb, glow);
  lamp.position.set(-0.48, 0, -0.22);
  lamp.userData.pick = "lamp";
  scene.add(lamp);

  const spot = new THREE.SpotLight(0xffc089, 18, 3.4, 0.9, 0.8, 2);
  spot.position.set(-0.25, 0.95, 0.35);
  spot.target.position.set(0.02, 0.04, -0.02);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0006;
  spot.shadow.normalBias = 0.025;
  spot.shadow.camera.near = 0.12;
  spot.shadow.camera.far = 3.5;
  scene.add(spot, spot.target);

  const hemi = new THREE.HemisphereLight(0x31465c, 0x1a120c, 0.42);
  scene.add(hemi);
  const rim = new THREE.DirectionalLight(0x8eb4d4, 0.22);
  rim.position.set(0.4, 0.8, -1);
  scene.add(rim);

  const plateCanvas = document.createElement("canvas");
  plateCanvas.width = 640;
  plateCanvas.height = 160;
  const plateCtx = plateCanvas.getContext("2d");
  paintPlate(plateCtx, "norma");
  const plateTex = canvasTexture(plateCanvas, anisotropy);
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.008, 0.09),
    new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.55, metalness: 0.45 }),
  );
  plate.rotation.x = -Math.PI / 2;
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.02, 16), brass);
  knob.position.set(-0.16, 0.016, 0.36);
  const notch = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.016), darkSteel);
  notch.position.set(0, 0.012, -0.012);
  knob.add(notch);
  plate.position.set(0.06, 0.008, 0.36);
  plate.userData.pick = "switch";
  knob.userData.pick = "switch";
  scene.add(plate, knob);

  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.028, 0.05, 18, 1, true), steel);
  cup.position.set(-0.5, 0.03, 0.22);
  cup.castShadow = true;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 6, 10, Math.PI), steel);
  handle.position.set(-0.46, 0.03, 0.22);
  handle.rotation.y = Math.PI / 2;
  scene.add(cup, handle);

  function ampoule(color, x, z, rot) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.008, 0.028, 4, 8),
      new THREE.MeshStandardMaterial({
        color: 0xd5e6ea,
        transparent: true,
        opacity: 0.45,
        roughness: 0.1,
      }),
    );
    const fluid = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.0055, 0.016, 3, 6),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.4 }),
    );
    fluid.position.y = -0.006;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 8), steel);
    cap.position.y = 0.02;
    group.add(body, fluid, cap);
    group.position.set(x, 0.02, z);
    group.rotation.z = rot;
    return group;
  }
  scene.add(ampoule(0x8e1e16, 0.7, 0.02, Math.PI / 2.2));
  scene.add(ampoule(0xd8a15a, 0.74, 0.06, Math.PI / 2.05));
  scene.add(ampoule(0xdfe7ea, 0.68, 0.08, Math.PI / 1.9));

  const pencil = new THREE.Group();
  const wood = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6),
    new THREE.MeshStandardMaterial({ color: 0xc4552a, roughness: 0.7 }),
  );
  wood.rotation.z = Math.PI / 2;
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.004, 0.02, 6),
    new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.6 }),
  );
  tip.rotation.z = -Math.PI / 2;
  tip.position.x = 0.09;
  pencil.add(wood, tip);
  pencil.position.set(0.22, 0.025, 0.16);
  pencil.rotation.y = 0.4;
  scene.add(pencil);

  const porthole = new THREE.Group();
  porthole.position.set(0.22, 0.52, -0.82);
  const starMat = new THREE.MeshBasicMaterial({ map: canvasTexture(starTexture(), 1) });
  const stars = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), starMat);
  stars.position.z = -0.28;
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_FRAG,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(0.18, 36, 28), earthMat);
  earth.position.z = -0.1;
  const portGlass = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 36),
    new THREE.MeshStandardMaterial({
      color: 0x9bb4c8,
      transparent: true,
      opacity: 0.08,
      roughness: 0.05,
      depthWrite: false,
    }),
  );
  portGlass.position.z = 0.02;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.028, 10, 28), darkSteel);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 8), steel);
    rivet.rotation.x = Math.PI / 2;
    rivet.position.set(Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0.02);
    porthole.add(rivet);
  }
  porthole.add(stars, earth, portGlass, ring);
  scene.add(porthole);

  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.04), darkSteel);
  panel.position.set(-0.42, 0.5, -0.78);
  const buttonMat = new THREE.MeshStandardMaterial({ color: 0x9a2a22, emissive: 0x661108, emissiveIntensity: 0.4 });
  const alarmButton = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 10), buttonMat);
  alarmButton.position.set(-0.42, 0.66, -0.75);
  scene.add(panel, alarmButton);

  const dustCount = software ? 60 : 140;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    dustPos[i * 3] = -0.45 + Math.random() * 0.7;
    dustPos[i * 3 + 1] = 0.05 + Math.random() * 0.45;
    dustPos[i * 3 + 2] = -0.1 + Math.random() * 0.5;
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: 0xffe0b8,
      size: 0.0035,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(dust);

  let composer = null;
  if (usePost) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.45, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const look = new THREE.Vector3();
  const pointerSmoothed = { x: 0, y: 0 };
  let rustle = 0;
  let plateScenario = "norma";
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickables = [leftPage.front, rightPage.front, watch, helmet, lamp, plate, knob];
  const api = {
    gpuName,
    software,
    usePost,
    hover: null,
    resize,
    markDirty() {
      leftTex.needsUpdate = true;
      rightTex.needsUpdate = true;
    },
    rustle() {
      rustle = 0.001;
    },
    pick(clientX, clientY) {
      return hitAt(clientX, clientY);
    },
    update(dt, snap, ui, pointer) {
      const poseKey = ui.mode === "diario" && ui.chapter != null ? "capitulo" : ui.mode;
      const pose = POSE[poseKey] ?? POSE.diario;
      const k = 1 - Math.exp(-dt * 3.1);
      camPos.lerp(new THREE.Vector3(...pose.pos), k);
      camTarget.lerp(new THREE.Vector3(...pose.target), k);
      const fovK = 1 - Math.exp(-dt * 3.1);
      camera.fov += (pose.fov - camera.fov) * fovK;
      camera.updateProjectionMatrix();
      pointerSmoothed.x += (pointer.nx - pointerSmoothed.x) * Math.min(1, dt * 4);
      pointerSmoothed.y += (pointer.ny - pointerSmoothed.y) * Math.min(1, dt * 4);
      const parallax = ui.mode === "casco" ? 0.012 : 0.03;
      camera.position.copy(camPos);
      camera.position.x += pointerSmoothed.x * parallax;
      camera.position.y += -pointerSmoothed.y * parallax * 0.45;
      camera.position.y += Math.sin(snap.t * 0.45) * 0.004;
      look.copy(camTarget);
      camera.lookAt(look);

      const alarm = snap.worst === "bad" ? 1 : snap.worst === "watch" ? 0.25 : 0;
      const warm = new THREE.Color(0xffb066);
      const hot = new THREE.Color(0xff5a32);
      spot.color.copy(warm).lerp(hot, alarm);
      glow.material.color.copy(spot.color);
      const flicker = 1 + Math.sin(snap.t * 37) * 0.02 + Math.sin(snap.t * 91) * 0.015;
      spot.intensity = 18 * flicker;
      bulbMat.emissiveIntensity = 2.1 * flicker;
      sideLampMat.emissiveIntensity = 0.3 + alarm * (0.7 + Math.sin(snap.t * 10) * 0.5);
      buttonMat.emissiveIntensity = 0.3 + alarm * (0.8 + Math.sin(snap.t * 9) * 0.4);

      const r = snap.readings;
      heart.userData.pivot.rotation.y = gaugeRotationY(unitT(r.hr, 40, 170)) - snap.beat * 0.08;
      o2.userData.pivot.rotation.y = gaugeRotationY(unitT(r.o2, 0, 100));
      co2.userData.pivot.rotation.y = gaugeRotationY(unitT(r.co2, 0, 2));
      watchBody.userData.pivot.rotation.y = gaugeRotationY(logT(r.rad, 0.05, 6));
      const level = unitT(r.psi, 2, 5);
      const h = 0.02 + level * (tubeH - 0.04);
      liquid.scale.y = h;
      liquid.position.y = -tubeH / 2 + 0.012 + h / 2;
      const fluid = snap.judge.traje === "bad" ? 0xb43322 : snap.judge.traje === "watch" ? 0xc4882a : 0x1f8f5a;
      liquidMat.color.setHex(fluid);
      liquidMat.emissive.setHex(fluid);

      if (ui.mode === "reloj" || Math.floor(snap.t * 8) !== Math.floor((snap.t - dt) * 8)) {
        watchPainter.paint(snap);
        watchTex.needsUpdate = true;
      }

      if (snap.scenario.id !== plateScenario) {
        plateScenario = snap.scenario.id;
        paintPlate(plateCtx, plateScenario);
        plateTex.needsUpdate = true;
      }
      const scenarioIndex = Math.max(0, SCENARIOS.findIndex((s) => s.id === snap.scenario.id));
      const knobSweep = (Math.PI / 2) * 3;
      const knobStep = knobSweep / Math.max(1, SCENARIOS.length - 1);
      knob.rotation.y += (scenarioIndex * knobStep - knob.rotation.y) * Math.min(1, dt * 8);

      if (rustle > 0) {
        rustle += dt;
        const p = rustle / 0.32;
        rightPage.pivot.rotation.y = -Math.sin(Math.min(p, 1) * Math.PI) * 0.2;
        if (p >= 1) rustle = 0;
      }

      earthMat.uniforms.uTime.value = snap.t;
      const dustAttr = dust.geometry.attributes.position;
      for (let i = 0; i < dustCount; i += 1) {
        let y = dustAttr.getY(i) + dt * 0.012;
        if (y > 0.55) y = 0.05;
        dustAttr.setY(i, y);
      }
      dustAttr.needsUpdate = true;

      api.hover = hitAt(pointer.x, pointer.y);

      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
  };

  function hitAt(clientX, clientY) {
    if (clientX == null || clientX < 0) return null;
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, true);
    for (const hit of hits) {
      let obj = hit.object;
      while (obj) {
        if (obj.userData && obj.userData.pick) {
          return { pick: obj.userData.pick, uv: hit.uv };
        }
        obj = obj.parent;
      }
    }
    return null;
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(pixelCap);
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setPixelRatio(pixelCap);
      composer.setSize(w, h);
    }
  }

  camPos.set(...POSE.diario.pos);
  camTarget.set(...POSE.diario.target);
  resize();
  return api;
}

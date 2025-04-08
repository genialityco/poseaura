import "./style.css";
import * as THREE from "three";

// Mediapipe
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// Postprocessing
import { EffectComposer, RenderPass } from "three/examples/jsm/Addons.js";

// Firebase (si lo usas localmente)
import { saveMessage } from "./firebaseMessages";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "./firebaseConfig";

// Referencias a elementos del DOM
const demosSection = document.getElementById("demos");
const video = document.getElementById("webcam") as HTMLVideoElement;
const threeContainer = document.getElementById("three-container")!;
const welcomeScreen = document.getElementById(
  "welcomeScreen"
) as HTMLDivElement;
const instructionScreen = document.getElementById(
  "instructionScreen"
) as HTMLDivElement;
const startButton = document.getElementById("startButton") as HTMLButtonElement;

// Modal (por si se usa localmente)
const signatureButton = document.getElementById(
  "signatureButton"
) as HTMLButtonElement;
const signatureModal = document.getElementById(
  "signatureModal"
) as HTMLDivElement;
const signatureSubmit = document.getElementById(
  "signatureSubmit"
) as HTMLButtonElement;
const signatureClose = document.getElementById(
  "signatureClose"
) as HTMLButtonElement;
const signatureInput = document.getElementById(
  "signatureInput"
) as HTMLTextAreaElement;

const msgBox = document.getElementById("msgBox") as HTMLDivElement;
const resetButton = document.getElementById("resetButton") as HTMLButtonElement;

// Estado global
let detectionActive = true;
let poseLandmarker!: PoseLandmarker;
let webcamRunning = false;
let lastVideoTime = -1;

// Suavizado de landmarks
const smoothingFactor = 0.8;
let previousLandmarks: Array<{ x: number; y: number; z: number }> = [];

// Tamaño del video
const videoHeight = "200px";
const videoWidth = "320px";

// Three.js y partículas
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let composer: EffectComposer;
let points: THREE.Points;
let particlePositions: Float32Array;
let basePositions: Float32Array;

// Emisores
let emitterGeometry: THREE.BufferGeometry;
let emitterPositions: Float32Array;
let emitterVelocities: Float32Array;
let emitterPoints: THREE.Points;

// Streams
let streamGeometry: THREE.BufferGeometry;
let streamPositions: Float32Array;
let streamVelocities: Float32Array;
let streamPoints: THREE.Points;

let poseGroup: THREE.Group;

let latestMessage = "";

// ----------------------------------------------------------------------
// AUDIO DE FONDO EN LA PANTALLA DE BIENVENIDA
// ----------------------------------------------------------------------
if (welcomeScreen) {
  const audio = new Audio("/Estrellas-1.mp3");
  audio.play().catch((err) => {
    console.log("Autoplay del audio fue bloqueado:", err);
  });
}

function listenForFlowState() {
  const controlRef = doc(db, "control", "session1");
  onSnapshot(controlRef, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data() as { flowState?: string; message?: string };
    console.log("Estado de flow:", data);

    // Solo si flowState = triggered => disparamos la animación
    if (data.flowState === "triggered") {
      latestMessage = data.message || "";
      triggerAnimation(latestMessage);
    }
  });
}

function triggerAnimation(msg: string) {
  console.log("Disparamos animación con mensaje:", msg);
  detectionActive = false;
  webcamRunning = false;

  // Apagamos tracks
  const stream = video.srcObject as MediaStream;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  // Quitamos partículas y webcam
  poseGroup?.clear();
  scene.remove(points);
  scene.remove(emitterPoints);
  scene.remove(streamPoints);
  video.style.display = "none";

  animateStarAt(new THREE.Vector3(0, 0, 0));
}

// ----------------------------------------------------------------------
// BOTÓN "COMENZAR"
// ----------------------------------------------------------------------
startButton.addEventListener("click", async () => {
  console.log("Hiciste clic en Comenzar!");
  welcomeScreen.classList.add("hidden");
  instructionScreen.classList.remove("hidden");

  const audio2 = new Audio("/Estrellas-2.mp3");
  audio2.play().catch((err) => {
    console.log("Autoplay Estrellas-2 bloqueado:", err);
  });

  setTimeout(async () => {
    instructionScreen.classList.add("hidden");

    await initThreeJS();
    await initPoseLandmarker();
    await enableWebcam();

    // Una vez listo, escuchamos en Firebase
    listenForFlowState();
  }, 11000);
});

// ----------------------------------------------------------------------
// FUNCIÓN PARA CREAR TEXTURA GLOW
// ----------------------------------------------------------------------
function createGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(255, 255, 0, 1)");
  gradient.addColorStop(0.5, "rgba(255, 255, 0, 0.5)");
  gradient.addColorStop(1, "rgba(255, 255, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
const glowTexture = createGlowTexture();

// ----------------------------------------------------------------------
// ANIMACIÓN FINAL DE LA ESTRELLA
// ----------------------------------------------------------------------
function animateStarAt(position: THREE.Vector3) {
  // Material y sprite grande para verlo bien
  const starMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
  });
  const starSprite = new THREE.Sprite(starMaterial);
  starSprite.position.copy(position);
  starSprite.scale.set(30, 30, 30);
  scene.add(starSprite);

  const totalDuration = 12000; // 12 segundos
  // Tres fases: 30% / 40% / 30%
  const phase1Ratio = 0.3;
  const phase2Ratio = 0.4;
  const phase3Ratio = 0.3;

  const startTime = performance.now();
  const origin = position.clone();

  // Parámetros de la órbita en fase 2
  const revolveRadius = 50;
  const revolveSpeed = 2 * Math.PI * 2; // 2 órbitas completas en la fase 2

  function animate() {
    const elapsed = performance.now() - startTime;
    const tTotal = Math.min(elapsed / totalDuration, 1);

    // Reproduce audio final
    const audio4 = new Audio("/Estrellas-4.mp3");
    audio4.play().catch((err) => {
      console.log("Audio Estrellas-4 bloqueado:", err);
    });

    if (tTotal < phase1Ratio) {
      // Fase 1: Crece
      const t1 = tTotal / phase1Ratio;
      const scale = 30 + 150 * t1;
      starSprite.scale.set(scale, scale, scale);
      starSprite.position.copy(origin);
      starMaterial.opacity = 1;

      // Rotación lenta inicial
      starSprite.rotation.x += 0.02;
      starSprite.rotation.y += 0.02;
      starSprite.rotation.z += 0.02;
    } else if (tTotal < phase1Ratio + phase2Ratio) {
      // Fase 2: Órbita y pulsación
      const t2 = (tTotal - phase1Ratio) / phase2Ratio;
      const angle = revolveSpeed * t2;

      // Movimiento en círculo
      starSprite.position.set(
        origin.x + revolveRadius * Math.cos(angle),
        origin.y + revolveRadius * Math.sin(angle),
        origin.z
      );

      // Escala base ~180 con una ligera oscilación ±20
      const baseScale = 180;
      const scaleOsc = 20;
      const s = baseScale + scaleOsc * Math.sin(5 * 2 * Math.PI * t2);
      starSprite.scale.set(s, s, s);

      // Rotación más rápida
      starSprite.rotation.x += 0.05;
      starSprite.rotation.y += 0.05;
      starSprite.rotation.z += 0.05;

      // Parpadeo
      const blink = 0.5 + 0.5 * Math.abs(Math.sin(4 * Math.PI * t2));
      starMaterial.opacity = blink;
    } else {
      // Fase 3: Subida + desvanecimiento
      const t3 = (tTotal - (phase1Ratio + phase2Ratio)) / phase3Ratio;
      const currentScale = starSprite.scale.x;
      const newScale = currentScale * (1 - t3);
      starSprite.scale.set(newScale, newScale, newScale);

      // Se eleva en Y
      starSprite.position.y += 1.5;

      // Rotación final más rápida
      starSprite.rotation.x += 0.1;
      starSprite.rotation.y += 0.1;
      starSprite.rotation.z += 0.1;

      // Opacidad
      starMaterial.opacity = 1 - t3;
    }

    // Renderiza usando composer
    composer.render();

    if (tTotal < 1) {
      requestAnimationFrame(animate);
    } else {
      // Elimina el sprite de la escena
      scene.remove(starSprite);

      showMessageBox();
    }
  }

  // Inicia la animación
  animate();
}

function showMessageBox() {
  msgBox.textContent = latestMessage;
  msgBox.classList.remove("hidden");
  resetButton.classList.remove("hidden");
}

resetButton.addEventListener("click", async () => {
  msgBox.classList.add("hidden");
  resetButton.classList.add("hidden");

  const controlRef = doc(db, "control", "session1");
  await updateDoc(controlRef, {
    flowState: "waiting",
    message: "",
  });
  window.location.reload()
});

// ----------------------------------------------------------------------
// INICIALIZAR ESCENA THREE.JS
// ----------------------------------------------------------------------
async function initThreeJS() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    1,
    1000
  );
  camera.position.z = 300;

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0);

  threeContainer.appendChild(renderer.domElement);

  composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  window.addEventListener("resize", onResize);

  poseGroup = new THREE.Group();
  poseGroup.renderOrder = 1;
  scene.add(poseGroup);

  // Partículas de landmarks
  const geometry = new THREE.BufferGeometry();
  particlePositions = new Float32Array(33 * 3);
  basePositions = new Float32Array(33 * 3);
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(particlePositions, 3)
  );

  const auraMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec3 vColor;
      void main() {
        vColor = vec3(0.9, 0.9, 1.0);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 15.0 * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        float glow = 1.0 - smoothstep(0.2, 0.5, dist);
        gl_FragColor = vec4(vColor, glow * 0.8);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  points = new THREE.Points(geometry, auraMaterial);
  scene.add(points);

  // Emisores
  emitterGeometry = new THREE.BufferGeometry();
  emitterPositions = new Float32Array(33 * 3);
  emitterVelocities = new Float32Array(33 * 3);
  emitterGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(emitterPositions, 3)
  );

  const emitterMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec3 vColor;
      void main() {
        vColor = vec3(1.0, 0.6, 0.0);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 20.0 * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        float glow = 1.0 - smoothstep(0.2, 0.5, dist);
        gl_FragColor = vec4(vColor, glow * 0.9);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  emitterPoints = new THREE.Points(emitterGeometry, emitterMaterial);
  scene.add(emitterPoints);

  // Streams
  streamGeometry = new THREE.BufferGeometry();
  streamPositions = new Float32Array(33 * 3 * 10);
  streamVelocities = new Float32Array(33 * 3 * 10);
  streamGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(streamPositions, 3)
  );

  const streamMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec3 vColor;
      void main() {
        vColor = vec3(0.6, 0.6, 1.0);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 8.0 * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        float glow = 1.0 - smoothstep(0.2, 0.5, dist);
        gl_FragColor = vec4(vColor, glow * 0.9);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  streamPoints = new THREE.Points(streamGeometry, streamMaterial);
  scene.add(streamPoints);

  animateScene();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

function animateScene() {
  requestAnimationFrame(animateScene);
  composer.render();
}

// ----------------------------------------------------------------------
// INICIALIZAR POSE LANDMARKER
// ----------------------------------------------------------------------
async function initPoseLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
  });
  console.log("PoseLandmarker listo, mostrando demos...");
  demosSection?.classList.remove("invisible");
}

// ----------------------------------------------------------------------
// HABILITAR CÁMARA
// ----------------------------------------------------------------------
async function enableWebcam() {
  if (!navigator.mediaDevices?.getUserMedia) {
    console.warn("getUserMedia() no es soportado en tu navegador.");
    return;
  }

  webcamRunning = true;
  const bgAudio = new Audio("/melody-back.mp3");
  bgAudio.loop = true;
  bgAudio.play().catch((err) => {
    console.log("Audio de fondo bloqueado:", err);
  });

  const constraints = { video: true };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;

  video.style.height = videoHeight;
  video.style.width = videoWidth;
  video.style.zIndex = "10";

  await new Promise<void>((resolve) => {
    video.onloadeddata = () => {
      video.play();
      resolve();
    };
  });

  // Quita loading si lo deseas
  // const loadingScreen = document.getElementById("loadingScreen");
  // if (loadingScreen) loadingScreen.classList.add("hidden");

  predictWebcam();
}

// ----------------------------------------------------------------------
// BUCLE DE DETECCIÓN
// ----------------------------------------------------------------------
async function predictWebcam() {
  if (
    !poseLandmarker ||
    !webcamRunning ||
    video.readyState < 2 ||
    !detectionActive
  ) {
    requestAnimationFrame(predictWebcam);
    return;
  }

  const currentTime = video.currentTime;
  if (lastVideoTime === currentTime) {
    requestAnimationFrame(predictWebcam);
    return;
  }
  lastVideoTime = currentTime;

  try {
    const result = await poseLandmarker.detectForVideo(
      video,
      performance.now()
    );
    if (result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];
      const smoothedLandmarks: { x: number; y: number; z: number }[] = [];

      for (let i = 0; i < landmarks.length; i++) {
        const curr = landmarks[i];
        if (previousLandmarks[i]) {
          const prev = previousLandmarks[i];
          smoothedLandmarks.push({
            x: smoothingFactor * prev.x + (1 - smoothingFactor) * curr.x,
            y: smoothingFactor * prev.y + (1 - smoothingFactor) * curr.y,
            z: smoothingFactor * prev.z + (1 - smoothingFactor) * curr.z,
          });
        } else {
          smoothedLandmarks.push(curr);
        }
      }
      previousLandmarks = smoothedLandmarks;

      // Actualizar Partículas
      for (let i = 0; i < smoothedLandmarks.length; i++) {
        const p = smoothedLandmarks[i];
        const idx = i * 3;
        const px = (p.x - 0.5) * 2 * 100;
        const py = -(p.y - 0.5) * 2 * 100;
        const pz = -p.z * 100;
        basePositions[idx] = px;
        basePositions[idx + 1] = py;
        basePositions[idx + 2] = pz;
      }
      particlePositions.set(basePositions);
      points.geometry.attributes.position.needsUpdate = true;

      // Emisores
      updateEmitters(smoothedLandmarks);

      // Streams
      updateStreams(smoothedLandmarks);
    }
  } catch (err) {
    console.error("Error en la detección de pose:", err);
  }

  requestAnimationFrame(predictWebcam);
}

// ----------------------------------------------------------------------
// ACTUALIZAR EMISORES (AURA)
// ----------------------------------------------------------------------
function updateEmitters(landmarks: { x: number; y: number; z: number }[]) {
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    const idx = i * 3;
    emitterPositions[idx] = (p.x - 0.5) * 2 * 100;
    emitterPositions[idx + 1] = -(p.y - 0.5) * 2 * 100;
    emitterPositions[idx + 2] = -p.z * 100;

    emitterVelocities[idx] += (Math.random() - 0.5) * 0.1;
    emitterVelocities[idx + 1] += (Math.random() - 0.5) * 0.1;
    emitterVelocities[idx + 2] += (Math.random() - 0.5) * 0.1;

    emitterPositions[idx] += emitterVelocities[idx];
    emitterPositions[idx + 1] += emitterVelocities[idx + 1];
    emitterPositions[idx + 2] += emitterVelocities[idx + 2];

    emitterVelocities[idx] *= 0.95;
    emitterVelocities[idx + 1] *= 0.95;
    emitterVelocities[idx + 2] *= 0.95;
  }
  emitterGeometry.attributes.position.needsUpdate = true;
}

// ----------------------------------------------------------------------
// ACTUALIZAR STREAMS
// ----------------------------------------------------------------------
function updateStreams(landmarks: { x: number; y: number; z: number }[]) {
  if (!streamGeometry) return;
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    const baseIndex = i * 3 * 10;
    streamPositions[baseIndex] = (p.x - 0.5) * 2 * 100;
    streamPositions[baseIndex + 1] = -(p.y - 0.5) * 2 * 100;
    streamPositions[baseIndex + 2] = -p.z * 100;

    for (let j = 1; j < 10; j++) {
      const idx = baseIndex + j * 3;
      streamVelocities[idx] += (Math.random() - 0.5) * 0.05;
      streamVelocities[idx + 1] += (Math.random() - 0.5) * 0.05;
      streamVelocities[idx + 2] += (Math.random() - 0.5) * 0.05;

      streamPositions[idx] += streamVelocities[idx];
      streamPositions[idx + 1] += streamVelocities[idx + 1];
      streamPositions[idx + 2] += streamVelocities[idx + 2];

      streamVelocities[idx] *= 0.95;
      streamVelocities[idx + 1] *= 0.95;
      streamVelocities[idx + 2] *= 0.95;

      const prevIdx = idx - 3;
      streamPositions[idx] +=
        (streamPositions[prevIdx] - streamPositions[idx]) * 0.1;
      streamPositions[idx + 1] +=
        (streamPositions[prevIdx + 1] - streamPositions[idx + 1]) * 0.1;
      streamPositions[idx + 2] +=
        (streamPositions[prevIdx + 2] - streamPositions[idx + 2]) * 0.1;
    }
  }
  streamGeometry.attributes.position.needsUpdate = true;
}

// ----------------------------------------------------------------------
// BOTONES/MODAL
// ----------------------------------------------------------------------
signatureButton.addEventListener("click", () => {
  signatureModal.classList.remove("hidden");
});
signatureClose.addEventListener("click", () => {
  signatureModal.classList.add("hidden");
});
signatureSubmit.addEventListener("click", async () => {
  const msg = signatureInput.value.trim();
  if (!msg) {
    alert("Por favor ingresa un mensaje antes de enviar.");
    return;
  }
  console.log("Mensaje recibido:", msg);

  // Guarda en Firebase, si lo usas local
  await saveMessage(msg);

  signatureModal.classList.add("hidden");
  signatureInput.value = "";

  // Audio
  const audio3 = new Audio("/Estrellas-3.mp3");
  audio3.play().catch((err) => {
    console.log("Audio Estrellas-3 bloqueado:", err);
  });

  // Detenemos pose
  detectionActive = false;
  webcamRunning = false;

  // Apagamos cámara
  const stream = video.srcObject as MediaStream;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }

  // Limpia
  poseGroup?.clear();
  scene.remove(points);
  scene.remove(emitterPoints);
  scene.remove(streamPoints);
  video.style.display = "none";

  // Lanza la estrella
  animateStarAt(new THREE.Vector3(0, 0, 0));
});

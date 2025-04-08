import "./style.css";
import * as THREE from "three";

// IMPORTS DE MEDIAPIPE
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// Ajusta si usas Bloom, etc. Aquí están RenderPass y EffectComposer
import { EffectComposer, RenderPass } from "three/examples/jsm/Addons.js";

// IMPORT FIREBASE (EN TU CASO)
import { saveMessage } from "./firebaseMessages";

// Elementos de la UI
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

// Modales/firma
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

// ------------------------------------------------------------------
// AJUSTE 1: Declaramos detectionActive para evitar ReferenceError
// ------------------------------------------------------------------
let detectionActive = true;

// Parámetros de detección
let poseLandmarker!: PoseLandmarker;
let webcamRunning = false;
let lastVideoTime = -1;
const smoothingFactor = 0.8;
let previousLandmarks: Array<{ x: number; y: number; z: number }> = [];

// Parámetros de tamaño del video
const videoHeight = "200px";
const videoWidth = "320px";

// Escena Three.js y partículas
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let composer: EffectComposer;

// Partículas para landmarks
let points: THREE.Points;
let particlePositions: Float32Array;
let basePositions: Float32Array;

// Emisores (aura en joints)
let emitterGeometry: THREE.BufferGeometry;
let emitterPositions: Float32Array;
let emitterVelocities: Float32Array;
let emitterPoints: THREE.Points;

// Streams (estela tipo "vía láctea")
let streamGeometry: THREE.BufferGeometry;
let streamPositions: Float32Array;
let streamVelocities: Float32Array;
let streamPoints: THREE.Points;

// Grupo que usabas antes para manipular la pose (si quieres líneas directas)
let poseGroup: THREE.Group;

// --------- AUDIO DE FONDO EN LA PRIMERA PANTALLA (opcional) ----------
if (welcomeScreen) {
  // Reproduce audio en la pantalla de bienvenida
  const audio = new Audio("/Estrellas-1.mp3");
  audio.play().catch((error) => {
    console.log("Autoplay del audio fue bloqueado: ", error);
  });
}

// --------- LÓGICA DE PANTALLA DE BIENVENIDA E INSTRUCCIONES -----------
startButton.addEventListener("click", async () => {
  welcomeScreen.classList.add("hidden");
  instructionScreen.classList.remove("hidden");

  const audio2 = new Audio("/Estrellas-2.mp3");
  audio2.play().catch((error) => {
    console.log("Autoplay del audio Estrellas-2 fue bloqueado: ", error);
  });

  setTimeout(async () => {
    instructionScreen.classList.add("hidden");
    const loadingScreen = document.getElementById("loadingScreen");
    if (loadingScreen) loadingScreen.classList.remove("hidden");

    // INICIAMOS ESCENA, MODELO Y WEBCAM
    await initThreeJS();
    await initPoseLandmarker();
    await enableWebcam();
  }, 11000);
});

// --------- CREACIÓN DE LA TEXTURA DE AURA (GLOW) ----------
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

/**
 * Animación final de la estrella (la que aparece al mandar mensaje).
 * Se ejecuta cuando se hace submit de la firma, se detiene la detección y recargamos.
 */
// -----------------------------------------------------------------------
// AJUSTE 2: Cambiar renderer.render(...) por composer.render() en animate()
// -----------------------------------------------------------------------
function animateStarAt(position: THREE.Vector3) {
  // Material y sprite grandes (para ver la estrella con la cámara alejada)
  const starMaterial = new THREE.SpriteMaterial({
    map: glowTexture,    // Reemplaza glowTexture por tu textura radial
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending, // opcional, da efecto "glow"
  });
  const starSprite = new THREE.Sprite(starMaterial);
  // Empieza en 'position' con escala inicial 30
  starSprite.position.copy(position);
  starSprite.scale.set(30, 30, 30);
  scene.add(starSprite);

  // Duración total y proporciones de cada fase
  const totalDuration = 12000; // 12s totales
  const phase1Ratio = 0.3;
  const phase2Ratio = 0.4;
  const phase3Ratio = 0.3;

  const startTime = performance.now();
  const origin = position.clone();

  // Parámetros para fase 2 (órbita)
  const revolveRadius = 50;     // radio de la órbita
  const revolveSpeed = 2 * Math.PI * 2; // 2 órbitas completas en la fase 2

  function animate() {
    const elapsed = performance.now() - startTime;
    const tTotal = Math.min(elapsed / totalDuration, 1);

    if (tTotal < phase1Ratio) {
      //----------------------------------------------------------------
      // FASE 1: Crece en el centro de escala 30 a ~180
      //----------------------------------------------------------------
      const t1 = tTotal / phase1Ratio; 
      const scale = 30 + 150 * t1; // 30 -> 180
      starSprite.scale.set(scale, scale, scale);

      // Permanecemos en el origin
      starSprite.position.copy(origin);

      // Opacidad completa
      starMaterial.opacity = 1;

      // Leve rotación
      starSprite.rotation.x += 0.02;
      starSprite.rotation.y += 0.02;
      starSprite.rotation.z += 0.02;

    } else if (tTotal < phase1Ratio + phase2Ratio) {
      //----------------------------------------------------------------
      // FASE 2: Órbita con pulsación en escala + parpadeo
      //----------------------------------------------------------------
      const t2 = (tTotal - phase1Ratio) / phase2Ratio;

      // Órbita alrededor del origin
      const angle = revolveSpeed * t2;
      starSprite.position.set(
        origin.x + revolveRadius * Math.cos(angle),
        origin.y + revolveRadius * Math.sin(angle),
        origin.z
      );

      // Escala base ~180 con una pequeña oscilación +-20
      const scaleBase = 180;
      const scaleOsc = 20;
      // Oscilamos 5 ciclos en la fase 2
      const s = scaleBase + scaleOsc * Math.sin(5 * 2 * Math.PI * t2);
      starSprite.scale.set(s, s, s);

      // Rotación más rápida
      starSprite.rotation.x += 0.05;
      starSprite.rotation.y += 0.05;
      starSprite.rotation.z += 0.05;

      // Parpadeo
      const blink = 0.5 + 0.5 * Math.abs(Math.sin(4 * Math.PI * t2));
      starMaterial.opacity = blink;

    } else {
      //----------------------------------------------------------------
      // FASE 3: Deja de orbitar, sube y se desvanece hasta desaparecer
      //----------------------------------------------------------------
      const t3 = (tTotal - (phase1Ratio + phase2Ratio)) / phase3Ratio;

      // Reducimos la escala desde la que tenga en fase 2 hasta 0
      const currentScale = starSprite.scale.x; // Escala actual que viene de la fase 2
      const newScale = currentScale * (1 - t3);
      starSprite.scale.set(newScale, newScale, newScale);

      // Movemos la estrella hacia arriba a razón de ~1.5 unidades por frame
      // (ajusta a tu gusto)
      starSprite.position.y += 1.5;

      starSprite.rotation.x += 0.1;
      starSprite.rotation.y += 0.1;
      starSprite.rotation.z += 0.1;

      // Se desvanece de 1 a 0
      starMaterial.opacity = 1 - t3;
    }

    // Renderizamos con post-procesado
    composer.render();

    if (tTotal < 1) {
      requestAnimationFrame(animate);
    } else {
      // Fase final: remover sprite y disparar audio
      scene.remove(starSprite);
      const audio4 = new Audio("/Estrellas-4.mp3");
      audio4.play().catch((error) => {
        console.log("La reproducción del audio Estrellas-4 fue bloqueada:", error);
      });
      // Si quieres recargar tras 0.5s
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  }

  animate();
}


/**
 * Inicializa la escena de Three.js con la configuración de partículas
 * (para la "aura" en los landmarks y streams tipo "vía láctea").
 */
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

  // POSTPROCESSING (Opcional)
  composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Si quisieras Bloom u otra cosa (opcional)
  // composer.addPass(
  //   new UnrealBloomPass(
  //     new THREE.Vector2(window.innerWidth, window.innerHeight),
  //     2.5,
  //     0.8,
  //     0.7
  //   )
  // );

  window.addEventListener("resize", onResize);

  // PoseGroup si quieres usar para objetos extras (líneas directas, etc.)
  poseGroup = new THREE.Group();
  poseGroup.renderOrder = 1;
  scene.add(poseGroup);

  // -------- SISTEMA DE PARTÍCULAS PARA LANDMARKS ------------
  const geometry = new THREE.BufferGeometry();
  // 33 landmarks * 3 coords
  particlePositions = new Float32Array(33 * 3);
  basePositions = new Float32Array(33 * 3);
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(particlePositions, 3)
  );

  const auraMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      uniform float time;
      varying vec3 vColor;
      void main() {
        // Color base un poco más brillante
        vColor = vec3(0.9, 0.9, 1.0);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // Aumentamos el tamaño base de 5.0 a 15.0
        gl_PointSize = 15.0 * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        // Calculamos la distancia al centro del sprite
        float dist = length(gl_PointCoord - vec2(0.5));
        // Ajusta 'smoothstep' a tu gusto para un contorno más definido
        float glow = 1.0 - smoothstep(0.2, 0.5, dist);
        // Subimos de 0.5 a 0.8 para más opacidad
        gl_FragColor = vec4(vColor, glow * 0.8);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  

  points = new THREE.Points(geometry, auraMaterial);
  scene.add(points);

  // ---------- SISTEMA DE EMISORES (GLOW) -----------
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
      uniform float time;
      varying vec3 vColor;
      void main() {
        // Subimos color y tamaño
        vColor = vec3(1.0, 0.6, 0.0); // naranja más claro
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // Antes era 10.0, lo subimos a 20.0
        gl_PointSize = 20.0 * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        float glow = 1.0 - smoothstep(0.2, 0.5, dist);
        // Un poco más de opacidad
        gl_FragColor = vec4(vColor, glow * 0.9);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  
  emitterPoints = new THREE.Points(emitterGeometry, emitterMaterial);
  scene.add(emitterPoints);

  // ---------- SISTEMA DE STREAMS (tipo Vía Láctea) -----------
  streamGeometry = new THREE.BufferGeometry();
  // 33 landmarks * 3 coords * 10 partículas por "stream"
  streamPositions = new Float32Array(33 * 3 * 10);
  streamVelocities = new Float32Array(33 * 3 * 10);
  streamGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(streamPositions, 3)
  );

  const streamMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      uniform float time;
      varying vec3 vColor;
      void main() {
        // Color base un poco más claro
        vColor = vec3(0.6, 0.6, 1.0);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // De 3.0 a 8.0 para que sea más notorio
        gl_PointSize = 8.0 * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        float glow = 1.0 - smoothstep(0.2, 0.5, dist);
        // Aumentamos un poco la opacidad
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

// --------- AJUSTE EN RESIZE ----------
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Bucle de animación para la escena.
 * Aquí refrescamos la escena con post-processing.
 */
function animateScene() {
  requestAnimationFrame(animateScene);

  const time = performance.now() * 0.001;
  // Actualiza uniform de tiempo para los shaders
  (points.material as THREE.ShaderMaterial).uniforms.time.value = time;
  (emitterPoints.material as THREE.ShaderMaterial).uniforms.time.value = time;
  (streamPoints.material as THREE.ShaderMaterial).uniforms.time.value = time;

  composer.render();
}

// ------------------- ACTUALIZACIÓN DE SISTEMA DE EMISORES ------------------
function updateEmitters(landmarks: { x: number; y: number; z: number }[]) {
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    const idx = i * 3;

    // Posición en 3D escalada
    emitterPositions[idx + 0] = (p.x - 0.5) * 2 * 100;
    emitterPositions[idx + 1] = -(p.y - 0.5) * 2 * 100;
    emitterPositions[idx + 2] = -p.z * 100;

    // Ajuste de velocidad
    emitterVelocities[idx + 0] += (Math.random() - 0.5) * 0.1;
    emitterVelocities[idx + 1] += (Math.random() - 0.5) * 0.1;
    emitterVelocities[idx + 2] += (Math.random() - 0.5) * 0.1;

    // Actualiza con velocidad
    emitterPositions[idx + 0] += emitterVelocities[idx + 0];
    emitterPositions[idx + 1] += emitterVelocities[idx + 1];
    emitterPositions[idx + 2] += emitterVelocities[idx + 2];

    // Frenado suave
    emitterVelocities[idx + 0] *= 0.95;
    emitterVelocities[idx + 1] *= 0.95;
    emitterVelocities[idx + 2] *= 0.95;
  }
  emitterGeometry.attributes.position.needsUpdate = true;
}

// ------------------- ACTUALIZACIÓN DE STREAMS --------------------
function updateStreams(landmarks: { x: number; y: number; z: number }[]) {
  if (!streamGeometry) return;

  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    // i3 en *landmark*, pero tenemos 10 partículas por landmark
    const baseIndex = i * 3 * 10;

    // Anclamos la primera partícula al landmark
    streamPositions[baseIndex + 0] = (p.x - 0.5) * 2 * 100;
    streamPositions[baseIndex + 1] = -(p.y - 0.5) * 2 * 100;
    streamPositions[baseIndex + 2] = -p.z * 100;

    // Las restantes se alejan
    for (let j = 1; j < 10; j++) {
      const idx = baseIndex + j * 3;
      // Actualiza velocidad
      streamVelocities[idx + 0] += (Math.random() - 0.5) * 0.05;
      streamVelocities[idx + 1] += (Math.random() - 0.5) * 0.05;
      streamVelocities[idx + 2] += (Math.random() - 0.5) * 0.05;

      streamPositions[idx + 0] += streamVelocities[idx + 0];
      streamPositions[idx + 1] += streamVelocities[idx + 1];
      streamPositions[idx + 2] += streamVelocities[idx + 2];

      // Frenado
      streamVelocities[idx + 0] *= 0.95;
      streamVelocities[idx + 1] *= 0.95;
      streamVelocities[idx + 2] *= 0.95;

      // Atrae ligeramente a la partícula previa
      const prevIdx = idx - 3;
      streamPositions[idx + 0] +=
        (streamPositions[prevIdx + 0] - streamPositions[idx + 0]) * 0.1;
      streamPositions[idx + 1] +=
        (streamPositions[prevIdx + 1] - streamPositions[idx + 1]) * 0.1;
      streamPositions[idx + 2] +=
        (streamPositions[prevIdx + 2] - streamPositions[idx + 2]) * 0.1;
    }
  }

  streamGeometry.attributes.position.needsUpdate = true;
}

// ------------------ INICIALIZAR POSE LANDMARKER -----------------------
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
    runningMode: "VIDEO", // nos interesa en video
    numPoses: 1,
  });
  console.log("PoseLandmarker cargado, mostrando demos...");
  demosSection?.classList.remove("invisible");
}

// ------------------ INICIAR CÁMARA -----------------------
async function enableWebcam() {
  if (!navigator.mediaDevices?.getUserMedia) {
    console.warn("getUserMedia() no es soportado en este navegador.");
    return;
  }

  webcamRunning = true;
  const bgAudio = new Audio("/melody-back.mp3");
  bgAudio.loop = true;
  bgAudio.play().catch((err) => {
    console.log("Audio de fondo bloqueado: ", err);
  });

  // Ajusta constraints a tu gusto
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

  // Ocultamos el loading
  const loadingScreen = document.getElementById("loadingScreen");
  if (loadingScreen) {
    loadingScreen.classList.add("hidden");
  }

  // Empezamos a predecir
  predictWebcam();
}

// ------------------ BUCLE DE DETECCIÓN -----------------------
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
    // No hay frame nuevo
    requestAnimationFrame(predictWebcam);
    return;
  }

  lastVideoTime = currentTime;

  try {
    // Detecta pose en el frame actual
    const result = await poseLandmarker.detectForVideo(
      video,
      performance.now()
    );
    if (result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];
      // Suavizado
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
          // Primer frame, sin suavizado
          smoothedLandmarks.push(curr);
        }
      }
      previousLandmarks = smoothedLandmarks;

      // Actualizamos partículas principales
      for (let i = 0; i < smoothedLandmarks.length; i++) {
        const p = smoothedLandmarks[i];
        const idx = i * 3;
        const px = (p.x - 0.5) * 2 * 100;
        const py = -(p.y - 0.5) * 2 * 100;
        const pz = -p.z * 100;
        basePositions[idx + 0] = px;
        basePositions[idx + 1] = py;
        basePositions[idx + 2] = pz;
      }
      particlePositions.set(basePositions);
      points.geometry.attributes.position.needsUpdate = true;

      // Actualizamos emisores (aura)
      updateEmitters(smoothedLandmarks);

      // Actualizamos streams
      updateStreams(smoothedLandmarks);
    }
  } catch (err) {
    console.error("Error en la detección de pose:", err);
  }

  requestAnimationFrame(predictWebcam);
}

// -------------- BOTONES/MODALES DE FIRMA -------------------
signatureButton.addEventListener("click", () => {
  signatureModal.classList.remove("hidden");
});

signatureClose.addEventListener("click", () => {
  signatureModal.classList.add("hidden");
});

signatureSubmit.addEventListener("click", async () => {
  const mensaje = signatureInput.value.trim();
  if (!mensaje) {
    alert("Por favor ingresa un mensaje antes de enviar.");
    return;
  }
  console.log("Mensaje recibido:", mensaje);

  // Guarda en Firebase
  await saveMessage(mensaje);

  signatureModal.classList.add("hidden");
  signatureInput.value = "";

  // Reproduce audio 3
  const audio3 = new Audio("/Estrellas-3.mp3");
  audio3.play().catch((error) => {
    console.log("Audio Estrellas-3 bloqueado:", error);
  });

  // Ponemos detectionActive en false y paramos la webcam
  detectionActive = false;
  webcamRunning = false;

  // Apagamos tracks de la cámara
  const stream = video.srcObject as MediaStream;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  // Limpia el group (si contenía líneas o sprites)
  poseGroup?.clear();

  // === BLOQUE NUEVO PARA ELIMINAR SISTEMAS DE PARTÍCULAS E ESCONDER VIDEO
  scene.remove(points);
  scene.remove(emitterPoints);
  scene.remove(streamPoints);
  video.style.display = "none";
  // === FIN BLOQUE NUEVO

  // Lanzamos la animación final
  animateStarAt(new THREE.Vector3(0, 0, 0));
});


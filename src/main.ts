import "./style.css";
import * as THREE from "three";

import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

const demosSection = document.getElementById("demos");

type RunningMode = "IMAGE" | "VIDEO";

// Variables de la detección de pose
let poseLandmarker!: PoseLandmarker;
let runningMode = "IMAGE";
let enableWebcamButton: HTMLButtonElement;
let detectionActive = true;
let webcamRunning: boolean = false;
const videoHeight = "200px";
const videoWidth = "320px";

// Parámetros para Three.js
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
const connectionMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
const pointSize = 0.05;

// Grupo para los objetos de la pose
let poseGroup: THREE.Group;

// Función para crear la textura de glow (aura)
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

function animateStarAt(position: THREE.Vector3) {
  const starMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    transparent: true,
    opacity: 1,
  });
  const starSprite = new THREE.Sprite(starMaterial);
  starSprite.position.copy(position);
  starSprite.scale.set(0.5, 0.5, 0.5);
  scene.add(starSprite);

  const totalDuration = 12000;

  // Dividimos la animación en 3 fases:
  const phase1Ratio = 0.3;
  const phase2Ratio = 0.4;
  const phase3Ratio = 0.3;
  const startTime = performance.now();
  const origin = position.clone();

  // Movimiento
  const moveRadiusX = 1.5;
  const moveRadiusY = 1.0; 
  const totalRotationDuringPhase2 = 4 * Math.PI; 

  function animate() {
    const elapsed = performance.now() - startTime;
    const tTotal = Math.min(elapsed / totalDuration, 1);

    if (tTotal < phase1Ratio) {
      //Expansión Inicial
      const tPhase1 = tTotal / phase1Ratio;
      const easeOut = 1 - Math.pow(1 - tPhase1, 3);
      const scale = 0.5 + easeOut * 2.5;
      starSprite.scale.set(scale, scale, scale);
      starSprite.position.copy(origin);
      starMaterial.opacity = 1;
      starSprite.rotation.x += easeOut * 0.05;
      starSprite.rotation.y += easeOut * 0.05;
      starSprite.rotation.z += easeOut * 0.05;
    } else if (tTotal < phase1Ratio + phase2Ratio) {
      const tPhase2 = (tTotal - phase1Ratio) / phase2Ratio;
      const angle = totalRotationDuringPhase2 * tPhase2;
      starSprite.position.set(
        origin.x + moveRadiusX * Math.cos(angle),
        origin.y + moveRadiusY * Math.sin(angle),
        origin.z
      );
      const baseScale = 0.5 + 2.5;
      const pulsation = 1 + 0.05 * Math.sin(8 * Math.PI * tPhase2);
      starSprite.scale.set(
        baseScale * pulsation,
        baseScale * pulsation,
        baseScale * pulsation
      );
      starSprite.rotation.x += 0.05;
      starSprite.rotation.y += 0.05;
      starSprite.rotation.z += 0.05;

      const blink = 0.5 + 0.5 * Math.abs(Math.sin(4 * Math.PI * tPhase2));
      starMaterial.opacity = tPhase2 < 0.5 ? 1 : blink;
    } else {
      const tPhase3 = (tTotal - phase1Ratio - phase2Ratio) / phase3Ratio;
      const exitOffsetY = 2.0;
      starSprite.position.y += exitOffsetY * tPhase3;
      starSprite.rotation.x += 0.1;
      starSprite.rotation.y += 0.1;
      starSprite.rotation.z += 0.1;

      starMaterial.opacity = 1 - tPhase3;
    }

    renderer.render(scene, camera);

    if (tTotal < 1) {
      requestAnimationFrame(animate);
    } else {
      scene.remove(starSprite);
      const audio4 = new Audio("/Estrellas-4.mp3");
      audio4.play().catch((error) => {
        console.log("La reproducción del audio Estrellas-4 fue bloqueada:", error);
      });
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  }
  animate();
}


// Inicialización de la escena Three.js
function initThreeJS() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 5;

  renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  document.getElementById("three-container")!.appendChild(renderer.domElement);

  // Obtener elementos del modal
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

  signatureButton.addEventListener("click", () => {
    signatureModal.classList.remove("hidden");
  });
  signatureClose.addEventListener("click", () => {
    signatureModal.classList.add("hidden");
  });
  signatureSubmit.addEventListener("click", () => {
    const mensaje = signatureInput.value.trim();
    if (!mensaje) {
      alert("Por favor ingresa un mensaje antes de enviar.");
      return;
    }
    console.log("Mensaje recibido:", mensaje);
    signatureModal.classList.add("hidden");
    signatureInput.value = "";
    const audio3 = new Audio("/Estrellas-3.mp3");
    audio3.play().catch((error) => {
      console.log(
        "La reproducción del audio Estrellas-3 fue bloqueada: ",
        error
      );
    });
    detectionActive = false;
    webcamRunning = false;
    const stream = video.srcObject as MediaStream;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (poseGroup) {
      poseGroup.clear();
    }
    animateStarAt(new THREE.Vector3(0, 0, 0));
  });

  poseGroup = new THREE.Group();
  poseGroup.renderOrder = 1;
  scene.add(poseGroup);
}

// Creamos el poseLandmarker esta función se ejecuta cuando el usuario presione "Comenzar"
const createPoseLandmarker = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: runningMode as RunningMode,
    numPoses: 2,
  });
  console.log("Termino de cargar, mostrando modelo");
  demosSection!.classList.remove("invisible");
};

// Configuración de la webcam y elementos de la interfaz
const video = document.getElementById("webcam") as HTMLVideoElement;
const canvasElement = document.getElementById(
  "output_canvas"
) as HTMLCanvasElement;
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

// Control de overlays
const welcomeScreen = document.getElementById(
  "welcomeScreen"
) as HTMLDivElement;
const instructionScreen = document.getElementById(
  "instructionScreen"
) as HTMLDivElement;
const startButton = document.getElementById("startButton") as HTMLButtonElement;

// REPRODUCIR AUDIO EN LA PRIMERA PANTALLA
if (welcomeScreen) {
  const audio = new Audio("/Estrellas-1.mp3");
  audio.play().catch((error) => {
    console.log("Autoplay del audio fue bloqueado: ", error);
  });
}

// Maneja el flujo de la pantalla de bienvenida
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
    if (loadingScreen) {
      loadingScreen.classList.remove("hidden");
    }
    await createPoseLandmarker();
    startCamera();
  }, 11000);
});

function startCamera() {
  if (hasGetUserMedia()) {
    enableWebcamButton = document.getElementById(
      "webcamButton"
    ) as HTMLButtonElement;
    enableWebcamButton.innerText = "■";
    webcamRunning = true;
    const bgAudio = new Audio("/melody-back.mp3");
    bgAudio.loop = true;
    bgAudio.play().catch((error) => {
      console.log("La reproducción del audio de fondo fue bloqueada: ", error);
    });
    const constraints = { video: true };
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      video.srcObject = stream;
      // Cuando el video cargue sus datos, ocultamos el loadingScreen y comenzamos la detección
      video.addEventListener("loadeddata", () => {
        const loadingScreen = document.getElementById("loadingScreen");
        if (loadingScreen) {
          loadingScreen.classList.add("hidden");
        }
        predictWebcam();
      });
    });
  } else {
    console.warn("getUserMedia() is not supported by your browser");
  }
}

let lastVideoTime = -1;

async function predictWebcam() {
  if (!scene) {
    initThreeJS();
  }
  if (!detectionActive) return;
  canvasElement.style.display = "none";
  video.style.height = videoHeight;
  video.style.width = videoWidth;
  if (runningMode === "IMAGE") {
    runningMode = "VIDEO";
    await poseLandmarker!.setOptions({ runningMode: "VIDEO" });
  }
  const oscFactor = 1 + 0.1 * Math.sin(performance.now() / 200);
  const startTimeMs = performance.now();
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    if (poseGroup) {
      scene.remove(poseGroup);
      poseGroup = new THREE.Group();
      poseGroup.renderOrder = 1;
      scene.add(poseGroup);
    }
    poseLandmarker!.detectForVideo(
      video,
      startTimeMs,
      (result: { landmarks: any }) => {
        for (const landmark of result.landmarks) {
          const vertices: number[] = [];
          for (const point of landmark) {
            vertices.push((point.x - 0.5) * 2, -(point.y - 0.5) * 2, -point.z);
          }
          const pointsGeometry = new THREE.BufferGeometry();
          pointsGeometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(vertices, 3)
          );
          const pointsMaterial = new THREE.PointsMaterial({
            color: 0xff0000,
            size: pointSize,
          });
          const pointsObj = new THREE.Points(pointsGeometry, pointsMaterial);
          poseGroup.add(pointsObj);
          const spriteMaterial = new THREE.SpriteMaterial({
            map: glowTexture,
            blending: THREE.AdditiveBlending,
            transparent: true,
          });
          for (let i = 0; i < landmark.length; i++) {
            const pt = landmark[i];
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(
              pointSize * 8 * oscFactor,
              pointSize * 8 * oscFactor,
              1
            );
            sprite.position.set((pt.x - 0.5) * 2, -(pt.y - 0.5) * 2, -pt.z);
            poseGroup.add(sprite);
          }
          const connections = PoseLandmarker.POSE_CONNECTIONS;
          for (const connection of connections) {
            const startIndex = connection.start;
            const endIndex = connection.end;
            if (startIndex < landmark.length && endIndex < landmark.length) {
              const startPt = landmark[startIndex];
              const endPt = landmark[endIndex];
              const v1 = new THREE.Vector3(
                (startPt.x - 0.5) * 2,
                -(startPt.y - 0.5) * 2,
                -startPt.z
              );
              const v2 = new THREE.Vector3(
                (endPt.x - 0.5) * 2,
                -(endPt.y - 0.5) * 2,
                -endPt.z
              );
              const lineGeom = new THREE.BufferGeometry().setFromPoints([
                v1,
                v2,
              ]);
              const line = new THREE.Line(lineGeom, connectionMaterial);
              poseGroup.add(line);
              const center = new THREE.Vector3()
                .addVectors(v1, v2)
                .multiplyScalar(0.5);
              const baseScale = 1.5;
              const lineScale = baseScale * oscFactor;
              const auraV1 = new THREE.Vector3()
                .subVectors(v1, center)
                .multiplyScalar(lineScale)
                .add(center);
              const auraV2 = new THREE.Vector3()
                .subVectors(v2, center)
                .multiplyScalar(lineScale)
                .add(center);
              const auraLineGeom = new LineGeometry();
              auraLineGeom.setPositions([
                auraV1.x,
                auraV1.y,
                auraV1.z,
                auraV2.x,
                auraV2.y,
                auraV2.z,
              ]);
              const auraLineMaterial = new LineMaterial({
                color: 0xffff00,
                transparent: true,
                opacity: 0.3,
                linewidth: 10,
              });
              auraLineMaterial.resolution.set(
                window.innerWidth,
                window.innerHeight
              );
              const auraLine = new Line2(auraLineGeom, auraLineMaterial);
              poseGroup.add(auraLine);
            }
          }
        }
        renderer.render(scene, camera);
      }
    );
  }
  if (webcamRunning) {
    window.requestAnimationFrame(predictWebcam);
  }
}

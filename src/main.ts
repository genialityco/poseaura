import "./style.css";
import * as THREE from "three";

import {
  PoseLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

const demosSection = document.getElementById("demos");

// Variables de la detección de pose
let poseLandmarker: PoseLandmarker = undefined;
let runningMode = "IMAGE";
let enableWebcamButton: HTMLButtonElement;
let detectionActive = true;
let webcamRunning: boolean = false;
const videoHeight = "360px";
const videoWidth = "480px";

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
  
  const duration = 2000; // 2 segundos
  const startTime = performance.now();
  
  function animate() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / duration, 1);
    const scale = 0.5 + t * 1.5;
    starSprite.scale.set(scale, scale, scale);
    starMaterial.opacity = 1 - t;
    renderer.render(scene, camera); // Actualiza la escena
    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      scene.remove(starSprite);
    }
  }
  animate();
}


// Inicialización de la escena Three.js
function initThreeJS() {
  scene = new THREE.Scene();

  // Cargar imagen de fondo (puedes usar una imagen en lugar del star field)
  const loader = new THREE.TextureLoader();
  loader.load("public/fondo.jpg", (texture) => {
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    scene.background = texture;
  });

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

  // Muestra el modal al pulsar "Deja tu huella"
  signatureButton.addEventListener("click", () => {
    signatureModal.classList.remove("hidden");
  });

  // Cierra el modal
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
    
    // Detener la detección
    detectionActive = false;
    webcamRunning = false;
    
    // Detener el stream de la cámara
    const stream = video.srcObject as MediaStream;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    // Limpiar el grupo de landmarks (si existe)
    if (poseGroup) {
      poseGroup.clear();
    }
    
    // Ejecutar la animación de la estrella en el centro
    animateStarAt(new THREE.Vector3(0, 0, 0));
  });
  


  // Grupo para los objetos de la pose (se mostrará sobre el fondo)
  poseGroup = new THREE.Group();
  poseGroup.renderOrder = 1;
  scene.add(poseGroup);
}

// Creamos el poseLandmarker
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
    runningMode: runningMode,
    numPoses: 2,
  });
  demosSection!.classList.remove("invisible");
};
createPoseLandmarker();

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

// Inicia la pantalla de bienvenida
startButton.addEventListener("click", () => {
  // Ocultamos la pantalla de bienvenida y mostramos la de instrucciones
  welcomeScreen.classList.add("hidden");
  instructionScreen.classList.remove("hidden");

  // Tras 3 segundos, se ocultan las instrucciones y se activa la cámara
  setTimeout(() => {
    instructionScreen.classList.add("hidden");
    startCamera();
  }, 3000);
});

function startCamera() {
  if (hasGetUserMedia()) {
    enableWebcamButton = document.getElementById(
      "webcamButton"
    ) as HTMLButtonElement;
    // En este ejemplo puedes ocultar el botón o activarlo según tu flujo
    enableWebcamButton.innerText = "DISABLE PREDICTIONS";
    webcamRunning = true;
    const constraints = { video: true };
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      video.srcObject = stream;
      video.addEventListener("loadeddata", predictWebcam);
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

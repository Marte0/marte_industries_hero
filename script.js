import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

// Funzione di linear interpolation (lerp)
function lerp(start, end, t) {
  return start + (end - start) * t;
}

// Shader Pixel Art migliorato
const PixelShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2() },
    pixelSize: { value: 8.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float pixelSize;
    varying vec2 vUv;

    vec3 toSRGB(vec3 color) {
      return pow(color, vec3(1.0 / 2.2));
    }

    void main() {
      vec2 dxy = pixelSize / resolution;
      vec2 coord = dxy * floor(vUv / dxy);
      vec4 color = texture2D(tDiffuse, coord);

      if (color.a < 0.5) discard;

      color.rgb = toSRGB(color.rgb);
      gl_FragColor = color;
    }
  `,
};

// Crea scena e camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 25;

// Renderer senza antialiasing
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("webgl"),
  antialias: false,
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xffffff);

// Variabili globali
let model;
let targetQuaternion = new THREE.Quaternion();
const smoothLookAt = new THREE.Vector3();
let pallina, pallaArancione;
let targetPallinaPosition = new THREE.Vector3();
let particles = []; // Particelle array

// Caricamento texture
const textureLoader = new THREE.TextureLoader();

// Palla arancione
const backgroundTexture = textureLoader.load("palla_arancione.png", (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
});
pallaArancione = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ map: backgroundTexture, transparent: true }));
pallaArancione.position.z = -5;
scene.add(pallaArancione);

// Pallina
const pallinaTexture = textureLoader.load("pallina.png", (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
});
pallina = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ map: pallinaTexture, transparent: true }));
pallina.position.z = -6;
pallina.scale.set(0.38, 0.38, 0.38);
scene.add(pallina);

// Caricamento occhi.gltf
const loader = new GLTFLoader();
loader.load(
  "occhi.gltf",
  (gltf) => {
    model = gltf.scene;
    model.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshBasicMaterial({
          color: "#59180B",
          flatShading: true,
        });
      }
    });
    scene.add(model);
  },
  undefined,
  (error) => {
    console.error("Errore caricamento modello:", error);
  }
);

// RenderTarget custom
const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  samples: 1,
});

// Composer per effetto pixel art
const composer = new EffectComposer(renderer, renderTarget);
composer.addPass(new RenderPass(scene, camera));

const pixelPass = new ShaderPass(PixelShader);
pixelPass.uniforms["resolution"].value.set(window.innerWidth, window.innerHeight);
pixelPass.uniforms["pixelSize"].value = 8.0;
composer.addPass(pixelPass);

// Raycaster e mouse
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Valori di pixelSize ciclici
const pixelSizes = [0.5, 12];
let currentPixelIndex = 0;

// Click sulla palla arancione
window.addEventListener("click", (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(pallaArancione);

  if (intersects.length > 0) {
    // Cambia pixel size
    currentPixelIndex = (currentPixelIndex + 1) % pixelSizes.length;
    pixelPass.uniforms.pixelSize.value = pixelSizes[currentPixelIndex];

    // Genera particelle
    for (let i = 0; i < 100; i++) {
      const size = pixelPass.uniforms.pixelSize.value * 0.05; // Dimensione particella basata su pixelSize
      const particle = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: 0x59180b, side: THREE.DoubleSide }));
      particle.position.copy(intersects[0].point);
      particle.velocity = new THREE.Vector3(
        (Math.random() - 0.3) * 0.2, // Più lento
        Math.random() * 0.4 + 0.1,
        (Math.random() - 0.5) * 0.2
      );
      particle.position.z = -7;
      scene.add(particle);
      particles.push(particle);
    }
  }
});

// Mouse move
window.addEventListener("mousemove", (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

// Funzione animazione
function animate() {
  requestAnimationFrame(animate);

  // Aggiorna particelle
  particles.forEach((particle, index) => {
    particle.velocity.y -= 0.01; // Gravità leggera
    particle.position.add(particle.velocity);

    if (particle.position.y < -20) {
      scene.remove(particle);
      particles.splice(index, 1);
    }
  });

  if (model) {
    raycaster.setFromCamera(mouse, camera);
    const target = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(17));

    smoothLookAt.lerp(target, 0.1);

    const temp = new THREE.Object3D();
    temp.position.copy(model.position);
    temp.lookAt(smoothLookAt);

    targetQuaternion.copy(temp.quaternion);
    model.quaternion.slerp(targetQuaternion, 0.1);

    const rotationX = THREE.MathUtils.radToDeg(model.rotation.x);
    const rotationY = THREE.MathUtils.radToDeg(model.rotation.y);

    const maxAngle = 30;
    const maxShift = 11;

    targetPallinaPosition.x = -(rotationY / maxAngle) * maxShift;
    targetPallinaPosition.y = (rotationX / maxAngle) * maxShift;

    pallina.position.x = lerp(pallina.position.x, targetPallinaPosition.x, 0.1);
    pallina.position.y = lerp(pallina.position.y, targetPallinaPosition.y, 0.1);
  }

  composer.render();
}

animate();

// Resize responsive
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  pixelPass.uniforms["resolution"].value.set(window.innerWidth, window.innerHeight);
});

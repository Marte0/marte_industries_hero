import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

function lerp(start, end, t) {
  return start + (end - start) * t;
}

const PixelShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2() },
    pixelSize: { value: 0.5 },
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

const scene = new THREE.Scene();
const frustumSize = 40;
let aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera((-frustumSize * aspect) / 2, (frustumSize * aspect) / 2, frustumSize / 2, -frustumSize / 2, 0.1, 1000);
camera.position.z = 25;

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("webgl"),
  alpha: true,
  antialias: false,
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);

let model;
let targetQuaternion = new THREE.Quaternion();
const smoothLookAt = new THREE.Vector3();
let pallina, pallaArancione;
let targetPallinaPosition = new THREE.Vector3();
let particles = [];

let mobileTarget = new THREE.Vector3();
let mobileTargetInterval;
let isHovered = false;
let pallaScaleTarget = 0.7;

function getRandomNDC() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 1;
  return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
}

function startMobileTargeting() {
  if (mobileTargetInterval) clearInterval(mobileTargetInterval);
  if (window.innerWidth < 1024) {
    mobileTargetInterval = setInterval(() => {
      const ndc = getRandomNDC();
      raycaster.setFromCamera(ndc, camera);
      mobileTarget.copy(raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(0.01)));
    }, Math.random() * (5000 - 1500) + 1500);
  }
}

const textureLoader = new THREE.TextureLoader();

const backgroundTexture = textureLoader.load("palla_arancione.png", (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
});
pallaArancione = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ map: backgroundTexture, transparent: true }));
pallaArancione.position.z = -5;
pallaArancione.scale.set(0.7, 0.7, 0.7);
scene.add(pallaArancione);

const pallinaTexture = textureLoader.load("pallina.png", (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
});
pallina = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ map: pallinaTexture, transparent: true }));
pallina.position.z = -6;
pallina.scale.set(0.266, 0.266, 0.266);
scene.add(pallina);

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
    model.scale.set(1, 1, 1);
    scene.add(model);
    updatePositions();
    startMobileTargeting();
  },
  undefined,
  (error) => {
    console.error("Errore caricamento modello:", error);
  }
);

function updatePositions() {
  const isMobile = window.innerWidth < 1024;

  if (pallaArancione) pallaArancione.position.set(isMobile ? 0 : 20, 0, 0);
  if (pallina) pallina.position.set(isMobile ? 0 : 20, 0, -5);
  if (model) model.position.set(isMobile ? 0 : 20, 0, 0);

  const maxAngle = 30;
  const maxShift = 6;
  const rotationY = THREE.MathUtils.radToDeg(model?.rotation?.y || 0);
  targetPallinaPosition.x = -(rotationY / maxAngle) * maxShift + (isMobile ? 0 : 20);
}

updatePositions();
startMobileTargeting();

const dpr = window.devicePixelRatio;
const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth * dpr, window.innerHeight * dpr, {
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  samples: 1,
});

const composer = new EffectComposer(renderer, renderTarget);
composer.addPass(new RenderPass(scene, camera));

const pixelPass = new ShaderPass(PixelShader);
pixelPass.uniforms["resolution"].value.set(window.innerWidth * dpr, window.innerHeight * dpr);
pixelPass.uniforms["pixelSize"].value = 0.5;
composer.addPass(pixelPass);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const pixelSizes = [0.5, 12];
let currentPixelIndex = 0;

window.addEventListener("click", (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(pallaArancione);

  if (intersects.length > 0) {
    if (!window.pixelActivated) {
      window.pixelActivated = true;
    }

    currentPixelIndex = (currentPixelIndex + 1) % pixelSizes.length;
    if (window.pixelActivated) {
      pixelPass.uniforms.pixelSize.value = pixelSizes[currentPixelIndex];
    }

    const center = intersects[0].object.position.clone();
    const radius = 7;
    const count = 75;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;

      const size = pixelPass.uniforms.pixelSize.value * 0.04;
      const particle = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: 0x59180b, side: THREE.DoubleSide }));
      particle.position.set(x, y, 7);
      particle.velocity = new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.2);
      scene.add(particle);
      particles.push(particle);
    }
  }
});

window.addEventListener("mousemove", (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(pallaArancione);
  isHovered = intersects.length > 0;
});

function animate() {
  requestAnimationFrame(animate);

  particles.forEach((particle, index) => {
    particle.velocity.y -= 0.03;
    particle.position.add(particle.velocity);
    if (particle.position.y < -20) {
      scene.remove(particle);
      particles.splice(index, 1);
    }
  });

  const targetScale = isHovered ? 0.8 : 0.7;
  pallaScaleTarget = lerp(pallaScaleTarget, targetScale, 0.1);
  pallaArancione.scale.set(pallaScaleTarget, pallaScaleTarget, pallaScaleTarget);

  if (model) {
    let target;
    const isMobile = window.innerWidth < 1024;

    if (isMobile) {
      target = mobileTarget;
    } else {
      raycaster.setFromCamera(mouse, camera);
      target = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(0.01));
    }

    smoothLookAt.lerp(target, 0.07);

    const temp = new THREE.Object3D();
    temp.position.copy(model.position);
    temp.lookAt(smoothLookAt);

    targetQuaternion.copy(temp.quaternion);
    model.quaternion.slerp(targetQuaternion, 0.3);

    const rotationX = THREE.MathUtils.radToDeg(model.rotation.x);
    const rotationY = THREE.MathUtils.radToDeg(model.rotation.y);
    const maxAngle = 30;
    const maxShift = 6;

    targetPallinaPosition.x = -(rotationY / maxAngle) * maxShift + (isMobile ? 0 : 20);
    targetPallinaPosition.y = (rotationX / maxAngle) * maxShift;

    pallina.position.x = lerp(pallina.position.x, targetPallinaPosition.x, 0.1);
    pallina.position.y = lerp(pallina.position.y, targetPallinaPosition.y, 0.1);
  }

  composer.render();
}

animate();

window.addEventListener("resize", () => {
  aspect = window.innerWidth / window.innerHeight;
  camera.left = (-frustumSize * aspect) / 2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  const dpr = window.devicePixelRatio;
  composer.setSize(window.innerWidth * dpr, window.innerHeight * dpr);
  pixelPass.uniforms["resolution"].value.set(window.innerWidth * dpr, window.innerHeight * dpr);

  updatePositions();
  startMobileTargeting();
});

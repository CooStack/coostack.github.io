import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

function isTransparentColor(value) {
  if (!value) return true;
  const text = String(value).trim().toLowerCase();
  if (!text || text === 'transparent') return true;
  if (text.startsWith('rgba(')) {
    const match = text.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i);
    if (match) {
      const alpha = Number(match[4]);
      return Number.isFinite(alpha) && alpha <= 0;
    }
  }
  return false;
}

function captureBackground(host) {
  const style = getComputedStyle(host);
  host.dataset.previewBgImage = style.backgroundImage || '';
  host.dataset.previewBgColor = style.backgroundColor || '';
}

function applyFullscreenBackground(host) {
  const bgColor = host.dataset.previewBgColor || '';
  const bgImage = host.dataset.previewBgImage || '';
  host.style.background = '';
  host.style.backgroundColor = isTransparentColor(bgColor) ? '#020617' : bgColor;
  host.style.backgroundImage = bgImage && bgImage !== 'none' ? bgImage : '';
}

function restoreBackground(host) {
  host.style.background = '';
  host.style.backgroundColor = '';
  host.style.backgroundImage = '';
}

function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

export function createThreePointsPreview({ canvas, host, pointSize = 0.07, onFpsChange = null }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 2000);
  camera.position.set(8, 8, 8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.8;
  controls.panSpeed = 0.8;
  controls.zoomSpeed = 0.95;
  controls.mouseButtons = {
    LEFT: -1,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.PAN
  };
  controls.target.set(0, 0, 0);
  renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

  const group = new THREE.Group();
  scene.add(group);

  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  const directional = new THREE.DirectionalLight(0xffffff, 0.9);
  directional.position.set(5, 8, 6);
  scene.add(ambient);
  scene.add(directional);

  const grid = new THREE.GridHelper(20, 20, 0x334155, 0x1e293b);
  const axes = new THREE.AxesHelper(4);
  scene.add(grid);
  scene.add(axes);

  let pointsMesh = null;
  let frameId = 0;
  let disposed = false;
  let currentPointSize = pointSize;
  let fpsLastTs = 0;
  let fpsFrames = 0;
  let hasFramedScene = false;

  function pushFps(now) {
    if (typeof onFpsChange !== 'function') return;
    const ts = Number(now);
    if (!Number.isFinite(ts)) return;
    if (!(fpsLastTs > 0)) {
      fpsLastTs = ts;
      fpsFrames = 0;
      return;
    }
    fpsFrames += 1;
    const dt = ts - fpsLastTs;
    if (dt < 400) return;
    const fps = dt > 0 ? (fpsFrames * 1000 / dt) : 0;
    fpsFrames = 0;
    fpsLastTs = ts;
    onFpsChange(fps);
  }

  function render(now = performance.now()) {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    pushFps(now);
    frameId = requestAnimationFrame(render);
  }

  function resize() {
    if (disposed) return;
    const width = host.clientWidth || 420;
    const height = host.clientHeight || 280;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }

  function clearPoints() {
    if (!pointsMesh) return;
    group.remove(pointsMesh);
    pointsMesh.geometry.dispose();
    pointsMesh.material.dispose();
    pointsMesh = null;
  }

  function updatePoints(points = []) {
    clearPoints();
    if (!points.length) {
      hasFramedScene = false;
      resetCamera();
      return;
    }

    const positions = new Float32Array(points.length * 3);
    points.forEach((point, index) => {
      positions[index * 3] = Number(point?.x || 0);
      positions[index * 3 + 1] = Number(point?.y || 0);
      positions[index * 3 + 2] = Number(point?.z || 0);
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x22c55e,
      size: Math.max(0.01, Number(currentPointSize) || 0.07),
      sizeAttenuation: true
    });
    pointsMesh = new THREE.Points(geometry, material);
    group.add(pointsMesh);
    if (!hasFramedScene) {
      resetCamera();
      hasFramedScene = true;
    }
  }

  function resetCamera() {
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) {
      camera.position.set(8, 8, 8);
      controls.target.set(0, 0, 0);
      controls.update();
      return;
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 1);
    camera.position.set(center.x + radius * 1.8, center.y + radius * 1.5, center.z + radius * 1.8);
    controls.target.copy(center);
    controls.update();
  }

  async function toggleFullscreen() {
    if (!host) return;
    if (!getFullscreenElement()) {
      captureBackground(host);
      const request = host.requestFullscreen || host.webkitRequestFullscreen;
      if (request) {
        await request.call(host);
        applyFullscreenBackground(host);
        resize();
      }
      return;
    }

    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) {
      await exit.call(document);
      restoreBackground(host);
      resize();
    }
  }

  function setGridVisible(value) {
    grid.visible = Boolean(value);
  }

  function setAxesVisible(value) {
    axes.visible = Boolean(value);
  }

  function setPointSize(value) {
    currentPointSize = Math.max(0.01, Number(value) || 0.07);
    if (pointsMesh?.material) {
      pointsMesh.material.size = currentPointSize;
      pointsMesh.material.needsUpdate = true;
    }
  }

  function dispose() {
    disposed = true;
    cancelAnimationFrame(frameId);
    clearPoints();
    controls.dispose();
    renderer.dispose();
  }

  resize();
  render();

  return {
    resize,
    updatePoints,
    resetCamera,
    toggleFullscreen,
    setGridVisible,
    setAxesVisible,
    setPointSize,
    dispose
  };
}
